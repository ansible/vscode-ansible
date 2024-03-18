/**
 * Guide to add settings:
 *
 * 1. Add appropriate setting type in the desired section (particular interface)
 * 2. Add the setting(s) to `ExtensionSetting` at appropriate nested level
 * 3. Go to `settingsManager.ts` and add the appropriate change
 */

export type IContainerEngine = "auto" | "podman" | "docker";

export type IPullPolicy = "always" | "missing" | "never" | "tag";

export interface ExtensionSettingsWithDescription {
  ansible: AnsibleSettingsWithDescription;
  completion: CompletionSettingsWithDescription;
  validation: ValidationSettingsWithDescription;
  executionEnvironment: ExecutionEnvironmentSettingsWithDescription;
  python: PythonSettingsWithDescription;
}

export interface ExtensionSettings {
  ansible: {
    path: string;
    useFullyQualifiedCollectionNames: boolean;
  };
  completion: {
    provideRedirectModules: boolean;
    provideModuleOptionAliases: boolean;
  };
  validation: {
    enabled: boolean;
    lint: { enabled: boolean; path: string; arguments: string };
  };
  executionEnvironment: {
    enabled: boolean;
    containerEngine: IContainerEngine;
    image: string;
    pull: { policy: IPullPolicy; arguments: string };
    volumeMounts: Array<IVolumeMounts>;
    containerOptions: string;
  };
  python: { interpreterPath: string; activationScript: string };
}

/**
 * Interface for execution environment settings
 */
interface ExecutionEnvironmentSettingsWithDescription {
  containerEngine: {
    default: IContainerEngine;
    description: string;
  };
  enabled: { default: boolean; description: string };
  image: { default: string; description: string };
  pull: {
    policy: { default: IPullPolicy; description: string };
    arguments: { default: string; description: string };
  };
  volumeMounts: Array<{
    src: { default: string; description: string };
    dest: { default: string; description: string };
    options: { default: string; description: string };
  }>;
  containerOptions: { default: string; description: string };
}

export interface IVolumeMounts {
  src: string;
  dest: string;
  options: string | undefined;
}

/**
 * Interface for ansible settings
 */
interface AnsibleSettingsWithDescription {
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
 * Interface for python settings
 */
interface PythonSettingsWithDescription {
  interpreterPath: {
    default: string;
    description: string;
  };
  activationScript: {
    default: string;
    description: string;
  };
}

/**
 * Interface for completion settings
 */
interface CompletionSettingsWithDescription {
  provideRedirectModules: {
    default: boolean;
    description: string;
  };
  provideModuleOptionAliases: {
    default: boolean;
    description: string;
  };
}

/**
 * Interface for validation settings
 */
interface ValidationSettingsWithDescription {
  enabled: {
    default: boolean;
    description: string;
  };
  lint: {
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
  };
}
