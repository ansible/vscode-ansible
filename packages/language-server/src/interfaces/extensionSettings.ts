/**
 * Language server extension settings types.
 *
 * EE (Execution Environment) settings are intentionally omitted --
 * container-based execution is deferred to a later phase.
 */

interface ExtensionSettingsType {
  [name: string]: ExtensionSettingsType | string | boolean | string[];
}

export interface ExtensionSettings extends ExtensionSettingsType {
  ansible: {
    path: string;
    useFullyQualifiedCollectionNames: boolean;
  };
  completion: {
    provideModuleOptionAliases: boolean;
  };
  validation: {
    enabled: boolean;
    lint: {
      enabled: boolean;
      path: string;
      arguments: string;
      autoFixOnSave: boolean;
    };
  };
  python: {
    interpreterPath: string;
    activationScript: string;
  };
}

export interface SettingsEntry {
  [name: string]:
    | { default: string | boolean; description: string }
    | SettingsEntry
    | string
    | boolean;
}

export interface ExtensionSettingsWithDescription {
  ansible: {
    path: { default: string; description: string };
    useFullyQualifiedCollectionNames: { default: boolean; description: string };
  };
  completion: {
    provideModuleOptionAliases: { default: boolean; description: string };
  };
  validation: {
    enabled: { default: boolean; description: string };
    lint: {
      enabled: { default: boolean; description: string };
      path: { default: string; description: string };
      arguments: { default: string; description: string };
      autoFixOnSave: { default: boolean; description: string };
    };
  };
  python: {
    interpreterPath: { default: string; description: string };
    activationScript: { default: string; description: string };
  };
  [key: string]: SettingsEntry | string | boolean;
}
