/**
 * Keep in sync with src/utils/containerCommandSafety.ts (vscode extension).
 */
import type { IVolumeMounts } from "@src/interfaces/extensionSettings.js";

/** Characters and sequences that enable shell command injection (CWE-78). */
const UNSAFE_SHELL_PATTERN = /[;&|$`<>\\\n\r]|(?:\$\()|(?:\$\{)|(?:\$\))/;

export class UnsafeContainerSettingError extends Error {
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

/**
 * Split a container-options string into argv tokens (supports simple quoting).
 */
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

export function parseContainerOptions(options: string): string[] {
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

export function formatVolumeMountSpec(mount: IVolumeMounts): string {
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

function validateExecutionEnvironmentImage(image: string): void {
  if (image.trim() === "") {
    return;
  }
  assertNoShellMetacharacters(image, "ansible.executionEnvironment.image");
}

export function validateContainerEngineSetting(engine: string): void {
  assertNoShellMetacharacters(
    engine,
    "ansible.executionEnvironment.containerEngine",
  );
  if (engine !== "auto" && engine !== "podman" && engine !== "docker") {
    throw new UnsafeContainerSettingError(
      "ansible.executionEnvironment.containerEngine",
    );
  }
}

export function validateExecutionEnvironmentSettings(
  containerOptions: string,
  volumeMounts: Array<IVolumeMounts>,
  image: string,
): void {
  validateExecutionEnvironmentImage(image);
  if (containerOptions.trim() !== "") {
    parseContainerOptions(containerOptions);
  }
  for (const mount of volumeMounts) {
    formatVolumeMountSpec(mount);
  }
}

/**
 * Split a command string into argv for the process run inside the container.
 */
export function splitCommandString(command: string): string[] {
  const trimmed = command.trim();
  if (trimmed === "") {
    return [];
  }
  return parseContainerOptions(trimmed);
}
