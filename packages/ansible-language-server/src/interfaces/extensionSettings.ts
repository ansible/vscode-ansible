/**
 * Guide to add settings:
 *
 * 1. Add appropriate setting type in the desired section (particular interface)
 * 2. Add the setting(s) to `ExtensionSetting` at appropriate nested level
 * 3. Go to `settingsManager.ts` and add the appropriate change
 */

export type IContainerEngine = "auto" | "podman" | "docker";

export type IPullPolicy = "always" | "missing" | "never" | "tag";

export interface ExtensionSettingsWithDescriptionBase {
  [key: string]: SettingsEntry | string | boolean;
}

export interface ExtensionSettingsWithDescription
  extends ExtensionSettingsWithDescriptionBase {
  ansible: AnsibleSettingsWithDescription;
  completion: CompletionSettingsWithDescription;
  validation: ValidationSettingsWithDescription;
  executionEnvironment: ExecutionEnvironmentSettingsWithDescription;
  python: PythonSettingsWithDescription;
}

export interface ExtensionSettingsType {
  [name: string]:
    | ExtensionSettingsType
    | string
    | boolean
    | string[]
    | IContainerEngine
    | IPullPolicy
    | IVolumeMounts[];
}

export interface ExtensionSettings extends ExtensionSettingsType {
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
interface ExecutionEnvironmentSettingsWithDescription extends SettingsEntry {
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
export interface SettingsEntry {
  [name: string]:
    | {
        default: string | boolean;
        description: string;
      }
    | SettingsEntry
    | string
    | boolean
    | Array<{
        src: { default: string; description: string };
        dest: { default: string; description: string };
        options: { default: string; description: string };
      }>;
}

interface AnsibleSettingsWithDescription extends SettingsEntry {
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
interface PythonSettingsWithDescription extends SettingsEntry {
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
interface CompletionSettingsWithDescription extends SettingsEntry {
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
interface ValidationSettingsWithDescription extends SettingsEntry {
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
