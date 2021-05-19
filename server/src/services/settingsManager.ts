import * as _ from 'lodash';
import { Connection } from 'vscode-languageserver';
import { DidChangeConfigurationParams } from 'vscode-languageserver-protocol';
import { ExtensionSettings } from '../interfaces/extensionSettings';

export class SettingsManager {
  private connection: Connection;
  private clientSupportsConfigRequests;
  private configurationChangeHandlers: Map<string, { (): void }> = new Map();

  // cache of document settings per workspace file
  private documentSettings: Map<string, Thenable<ExtensionSettings>> =
    new Map();

  private defaultSettings: ExtensionSettings = {
    ansible: { path: 'ansible', useFullyQualifiedCollectionNames: true },
    ansibleLint: { enabled: true, path: 'ansible-lint' },
  };
  private globalSettings: ExtensionSettings = this.defaultSettings;

  constructor(connection: Connection, clientSupportsConfigRequests: boolean) {
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

  public get(uri: string): Thenable<ExtensionSettings> {
    if (!this.clientSupportsConfigRequests) {
      return Promise.resolve(this.globalSettings);
    }
    let result = this.documentSettings.get(uri);
    if (!result) {
      result = this.connection.workspace.getConfiguration({
        scopeUri: uri,
        section: 'ansible',
      });
      this.documentSettings.set(uri, result);
    }
    return result;
  }

  public handleDocumentClosed(uri: string): void {
    this.documentSettings.delete(uri);
  }

  public async handleConfigurationChanged(
    params: DidChangeConfigurationParams
  ): Promise<void> {
    if (this.clientSupportsConfigRequests) {
      // find configuration change handlers to fire

      const newDocumentSettings: Map<string, Thenable<ExtensionSettings>> =
        new Map();
      const handlersToFire: { (): void }[] = [];

      for (const [uri, handler] of this.configurationChangeHandlers) {
        const config = await this.documentSettings.get(uri);
        if (config) {
          // found cached values, now compare to the new ones

          const newConfigPromise = this.connection.workspace.getConfiguration({
            scopeUri: uri,
            section: 'ansible',
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
}
