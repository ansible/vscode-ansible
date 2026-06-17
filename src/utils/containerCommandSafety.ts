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

function parseContainerOptions(options: string): string[] {
  const trimmed = options.trim();
  if (trimmed === "") {
    return [];
  }
  assertNoShellMetacharacters(
    trimmed,
    "ansible.executionEnvironment.containerOptions",
  );

  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (inSingle) {
      if (char === "'") {
        inSingle = false;
      } else {
        current += char;
      }
      continue;
    }
    if (inDouble) {
      if (char === '"') {
        inDouble = false;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'") {
      inSingle = true;
      continue;
    }
    if (char === '"') {
      inDouble = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (current !== "") {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (inSingle || inDouble) {
    throw new UnsafeContainerSettingError(
      "ansible.executionEnvironment.containerOptions",
    );
  }
  if (current !== "") {
    tokens.push(current);
  }
  return tokens;
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
