/**
 * Keep in sync with packages/ansible-language-server/src/utils/containerCommandSafety.ts
 */
interface IVolumeMounts {
  src: string;
  dest: string;
  options: string | undefined;
}

/** Characters and sequences that enable shell command injection (CWE-78). */
const UNSAFE_SHELL_PATTERN = /[;&|$`<>\\\n\r]|(?:\$\()|(?:\$\{)|(?:\$\))/;

class UnsafeContainerSettingError extends Error {
  constructor(settingLabel: string) {
    super(
      `Invalid ${settingLabel}: contains disallowed shell metacharacters. ` +
        "Remove characters such as ; | & $ ` and command substitution.",
    );
    this.name = "UnsafeContainerSettingError";
  }
}

function assertNoShellMetacharacters(
  value: string,
  settingLabel: string,
): void {
  if (UNSAFE_SHELL_PATTERN.test(value)) {
    throw new UnsafeContainerSettingError(settingLabel);
  }
}

interface TokenizerState {
  tokens: string[];
  current: string;
  inSingle: boolean;
  inDouble: boolean;
}

function processQuotedChar(char: string, state: TokenizerState): boolean {
  if (state.inSingle) {
    if (char === "'") {
      state.inSingle = false;
    } else {
      state.current += char;
    }
    return true;
  }
  if (state.inDouble) {
    if (char === '"') {
      state.inDouble = false;
    } else {
      state.current += char;
    }
    return true;
  }
  return false;
}

function processUnquotedChar(char: string, state: TokenizerState): void {
  if (char === "'") {
    state.inSingle = true;
  } else if (char === '"') {
    state.inDouble = true;
  } else if (/\s/.test(char)) {
    if (state.current !== "") {
      state.tokens.push(state.current);
      state.current = "";
    }
  } else {
    state.current += char;
  }
}

function parseContainerOptions(options: string): string[] {
  const trimmed = options.trim();
  if (trimmed === "") {
    return [];
  }
  assertNoShellMetacharacters(
    trimmed,
    "ansible.executionEnvironment.containerOptions",
  );

  const state: TokenizerState = {
    tokens: [],
    current: "",
    inSingle: false,
    inDouble: false,
  };

  for (const char of trimmed) {
    if (!processQuotedChar(char, state)) {
      processUnquotedChar(char, state);
    }
  }

  if (state.inSingle || state.inDouble) {
    throw new UnsafeContainerSettingError(
      "ansible.executionEnvironment.containerOptions",
    );
  }
  if (state.current !== "") {
    state.tokens.push(state.current);
  }
  return state.tokens;
}

function formatVolumeMountSpec(mount: IVolumeMounts): string {
  assertNoShellMetacharacters(
    mount.src,
    "ansible.executionEnvironment.volumeMounts src",
  );
  assertNoShellMetacharacters(
    mount.dest,
    "ansible.executionEnvironment.volumeMounts dest",
  );
  if (mount.options !== undefined && mount.options !== "") {
    assertNoShellMetacharacters(
      mount.options,
      "ansible.executionEnvironment.volumeMounts options",
    );
  }

  let spec = `${mount.src}:${mount.dest}`;
  if (mount.options !== undefined && mount.options !== "") {
    spec += `:${mount.options}`;
  }
  return spec;
}

export function validateExecutionEnvironmentSettings(
  containerOptions: string,
  volumeMounts: Array<IVolumeMounts>,
  image: string,
): void {
  if (image.trim() !== "") {
    assertNoShellMetacharacters(image, "ansible.executionEnvironment.image");
  }
  if (containerOptions.trim() !== "") {
    parseContainerOptions(containerOptions);
  }
  for (const mount of volumeMounts) {
    formatVolumeMountSpec(mount);
  }
}
