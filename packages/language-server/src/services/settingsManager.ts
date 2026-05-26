import _ from "lodash";
import { Connection } from "vscode-languageserver";
import { DidChangeConfigurationParams } from "vscode-languageserver-protocol";
import type {
  ExtensionSettingsWithDescription,
  ExtensionSettings,
  SettingsEntry,
} from "../interfaces/extensionSettings";

export class SettingsManager {
  private connection: Connection | null;
  private clientSupportsConfigRequests: boolean;
  private configurationChangeHandlers: Map<string, () => void> = new Map();
  private documentSettings: Map<string, Thenable<ExtensionSettings>> =
    new Map();

  readonly defaultSettingsWithDescription: ExtensionSettingsWithDescription = {
    ansible: {
      path: {
        default: "ansible",
        description: "Path to the ansible executable",
      },
      useFullyQualifiedCollectionNames: {
        default: true,
        description:
          "Toggle usage of fully qualified collection names (FQCN) when inserting module names",
      },
    },
    python: {
      interpreterPath: {
        default: "",
        description:
          "Path to the python/python3 executable. This setting may be used to make the extension work with ansible and ansible-lint installations in a Python virtual environment",
      },
      activationScript: {
        default: "",
        description:
          "Path to a custom activation script to run in a Python virtual environment",
      },
    },
    completion: {
      provideModuleOptionAliases: {
        default: true,
        description: "Toggle alias provider when completing module options",
      },
    },
    validation: {
      enabled: {
        default: true,
        description:
          "Toggle validation provider. If enabled and ansible-lint is disabled, validation falls back to ansible-playbook --syntax-check",
      },
      lint: {
        enabled: {
          default: true,
          description: "Toggle usage of ansible-lint",
        },
        path: {
          default: "ansible-lint",
          description: "Path to the ansible-lint executable",
        },
        arguments: {
          default: "",
          description:
            "Optional command line arguments to be appended to ansible-lint invocation",
        },
        autoFixOnSave: {
          default: false,
          description:
            "Whether `ansible-lint --fix` should run automatically on save",
        },
      },
    },
  };

  private defaultSettings: ExtensionSettings = this.settingsAdjustment(
    _.cloneDeep(this.defaultSettingsWithDescription),
  ) as unknown as ExtensionSettings;

  public globalSettings: ExtensionSettings = this.defaultSettings;

  constructor(
    connection: Connection | null,
    clientSupportsConfigRequests: boolean,
  ) {
    this.connection = connection;
    this.clientSupportsConfigRequests = clientSupportsConfigRequests;
  }

  public onConfigurationChanged(uri: string, handler: () => void): void {
    this.configurationChangeHandlers.set(uri, handler);
  }

  public async get(uri: string): Promise<ExtensionSettings> {
    if (!this.clientSupportsConfigRequests) {
      return this.globalSettings;
    }
    let result = this.documentSettings.get(uri);
    if (!result && this.connection) {
      const clientSettings = await this.connection.workspace.getConfiguration({
        scopeUri: uri,
        section: "ansible",
      });
      const mergedSettings = _.merge(
        _.cloneDeep(this.globalSettings),
        clientSettings,
      );
      result = Promise.resolve(mergedSettings);
      this.documentSettings.set(uri, result);
    }
    if (!result) {
      return {} as ExtensionSettings;
    }
    return result;
  }

  public handleDocumentClosed(uri: string): void {
    this.documentSettings.delete(uri);
  }

  public async handleConfigurationChanged(
    params: DidChangeConfigurationParams,
  ): Promise<void> {
    if (this.clientSupportsConfigRequests) {
      const newDocumentSettings = new Map<
        string,
        Thenable<ExtensionSettings>
      >();
      const handlersToFire: (() => void)[] = [];

      for (const [uri, handler] of this.configurationChangeHandlers) {
        const config = await this.documentSettings.get(uri);
        if (config && this.connection) {
          const newConfigPromise = this.connection.workspace.getConfiguration({
            scopeUri: uri,
            section: "ansible",
          });
          newDocumentSettings.set(uri, newConfigPromise);

          if (!_.isEqual(config, await newConfigPromise)) {
            handlersToFire.push(handler);
          }
        }
      }

      this.documentSettings = newDocumentSettings;
      handlersToFire.forEach((h) => h());
    } else {
      if (params.settings.ansible) {
        this.configurationChangeHandlers.forEach((h) => h());
      }
      this.globalSettings = params.settings.ansible || this.defaultSettings;
    }
  }

  private settingsAdjustment(
    settingsObject: ExtensionSettingsWithDescription | SettingsEntry,
  ): ExtensionSettingsWithDescription {
    for (const key in settingsObject) {
      const value = settingsObject[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (
          Object.hasOwn(value, "default") &&
          value.default !== undefined &&
          typeof value.default !== "object"
        ) {
          settingsObject[key] = value.default;
        } else {
          this.settingsAdjustment(value as SettingsEntry);
        }
      }
    }
    return settingsObject as ExtensionSettingsWithDescription;
  }
}
