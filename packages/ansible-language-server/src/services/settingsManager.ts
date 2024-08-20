import * as _ from "lodash";
import { Connection } from "vscode-languageserver";
import { DidChangeConfigurationParams } from "vscode-languageserver-protocol";
import {
  ExtensionSettingsWithDescription,
  ExtensionSettings,
  SettingsEntry,
} from "../interfaces/extensionSettings";

export class SettingsManager {
  private connection: Connection | null;
  private clientSupportsConfigRequests;
  private configurationChangeHandlers: Map<string, { (): void }> = new Map();

  // cache of document settings per workspace file
  private documentSettings: Map<string, Thenable<ExtensionSettings>> =
    new Map();

  // settings with their default values and descriptions
  // default values of settings to be updated here
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
          "Path to the python/python3 executable. This settings may be used to make the extension work with ansible and ansible-lint installations in a python virtual environment",
      },
      activationScript: {
        default: "",
        description:
          "Path to a custom activation script, which is to be used instead of the settings above to run in a python virtual environment",
      },
    },
    executionEnvironment: {
      containerEngine: {
        default: "auto",
        description:
          "Container engine to be used while running with execution environment. valid values are 'auto', 'podman' and 'docker'. For 'auto', it will look for 'podman' and then for 'docker'",
      },
      enabled: {
        default: false,
        description: "Toggle usage of an execution environment",
      },
      image: {
        default: "ghcr.io/ansible/community-ansible-dev-tools:latest",
        description: "Name of the execution environment to be used",
      },
      pull: {
        policy: {
          default: "missing",
          description:
            "Image pull policy to be used. Valid values are 'always', 'missing', 'never' and 'tag'. always will always pull the image when extension is activated or reloaded. 'missing' will pull if not locally available. 'never' will never pull the image and 'tag' will always pull if the image tag is 'latest', otherwise pull if not locally available.",
        },
        arguments: {
          default: "",
          description:
            "Specify any additional parameters that should be added to the pull command when pulling an execution environment from a container registry. e.g. '-–tls-verify=false'",
        },
      },
      volumeMounts: [
        {
          src: {
            default: "",
            description:
              "The name of the local volume or path to be mounted within execution environment.",
          },
          dest: {
            default: "",
            description:
              "The path where the file or directory are mounted in the container.",
          },
          options: {
            default: "",
            description:
              "The field is optional, and is a comma-separated list of options, such as ro,Z",
          },
        },
      ],
      containerOptions: {
        default: "",
        description:
          "Extra parameters passed to the container engine command example: '--net=host'",
      },
    },
    completion: {
      provideRedirectModules: {
        default: true,
        description:
          "Toggle redirected module provider when completing modules",
      },
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
      },
    },
  };

  // Structure the settings similar to the ExtensionSettings interface for usage in the code
  private defaultSettings: ExtensionSettings = this._settingsAdjustment(
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

  /**
   * Register a handler for configuration change on particular URI.
   *
   * Change detection is cache-based. If the client does not support the
   * configuration requests, all handlers will be fired.
   */
  public onConfigurationChanged(uri: string, handler: { (): void }): void {
    this.configurationChangeHandlers.set(uri, handler);
  }

  public async get(uri: string): Promise<ExtensionSettings> {
    if (!this.clientSupportsConfigRequests) {
      return Promise.resolve(this.globalSettings);
    }
    let result = this.documentSettings.get(uri);
    if (!result && this.connection) {
      const clientSettings = await this.connection.workspace.getConfiguration({
        scopeUri: uri,
        section: "ansible",
      });
      // Recursively merge globalSettings with clientSettings to use:
      //  - setting from client when provided
      //  - default value of setting otherwise
      const mergedSettings = _.merge(this.globalSettings, clientSettings);
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
      // find configuration change handlers to fire

      const newDocumentSettings: Map<
        string,
        Thenable<ExtensionSettings>
      > = new Map();
      const handlersToFire: { (): void }[] = [];

      for (const [uri, handler] of this.configurationChangeHandlers) {
        const config = await this.documentSettings.get(uri);
        if (config && this.connection) {
          // found cached values, now compare to the new ones

          const newConfigPromise = this.connection.workspace.getConfiguration({
            scopeUri: uri,
            section: "ansible",
          });
          newDocumentSettings.set(uri, newConfigPromise);

          if (!_.isEqual(config, await newConfigPromise)) {
            // handlers may need to read config, so can't fire them until the
            // cache is purged
            handlersToFire.push(handler);
          }
        }
      }

      // resetting documents settings, but not wasting newly fetched values
      this.documentSettings = newDocumentSettings;

      // fire handlers
      handlersToFire.forEach((h) => h());
    } else {
      if (params.settings.ansible) {
        this.configurationChangeHandlers.forEach((h) => h());
      }
      this.globalSettings = params.settings.ansible || this.defaultSettings;
    }
  }

  /**
   * A recursive function to restructure the raw settings object similar to ExtensionSettings interface in order
   * to make it work with the code
   * @param settingsObject - settings object with `default` and `description` as keys
   * @returns settings - object with a structure similar to ExtensionSettings interface
   */
  private _settingsAdjustment(
    settingsObject: ExtensionSettingsWithDescription | SettingsEntry,
  ): ExtensionSettingsWithDescription {
    for (const key in settingsObject) {
      const value = settingsObject[key];

      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (
          Object.hasOwn(value, "default") &&
          value.default !== undefined &&
          typeof value.default != "object"
        ) {
          settingsObject[key] = value.default;
        } else {
          this._settingsAdjustment(value);
        }
      }
    }
    return settingsObject as ExtensionSettingsWithDescription;
  }
}
