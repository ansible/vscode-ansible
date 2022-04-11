/**
 * Guide to add settings:
 *
 * 1. Add appropriate setting type in the desired section (particular interface)
 * 2. Add the setting(s) to `ExtensionSetting` at appropriate nested level
 */

export type IContainerEngine = "auto" | "podman" | "docker";

export type IPullPolicy = "always" | "missing" | "never" | "tag";

export interface ExtensionSettingsWithDescription {
  ansible: AnsibleSettings;
  ansibleLint: AnsibleLintSettings;
  executionEnvironment: ExecutionEnvironmentSettings;
  python: PythonSettings;
}

export interface ExtensionSettings {
  ansible: { path: string; useFullyQualifiedCollectionNames: boolean };
  ansibleLint: { enabled: boolean; path: string; arguments: string };
  executionEnvironment: {
    enabled: boolean;
    containerEngine: IContainerEngine;
    image: string;
    pullPolicy: IPullPolicy;
  };
  python: { interpreterPath: string; activationScript: string };
}

/**
 * Interface for execution environment settings
 */
interface ExecutionEnvironmentSettings {
  containerEngine: {
    default: IContainerEngine;
    description: string;
  };
  enabled: { default: boolean; description: string };
  image: { default: string; description: string };
  pullPolicy: { default: IPullPolicy; description: string };
}

/**
 * Interface for ansible settings
 */
interface AnsibleSettings {
  path: {
    default: string;
    description: string;
  };
  useFullyQualifiedCollectionNames: {
    default: boolean;
    description: string;
  };
}

/**
 * Interface for ansible lint settings
 */
interface AnsibleLintSettings {
  enabled: {
    default: boolean;
    description: string;
  };
  path: {
    default: string;
    description: string;
  };
  arguments: {
    default: string;
    description: string;
  };
}

/**
 * Interface for python settings
 */
interface PythonSettings {
  interpreterPath: {
    default: string;
    description: string;
  };
  activationScript: {
    default: string;
    description: string;
  };
}
