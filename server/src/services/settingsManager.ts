import { Connection } from 'vscode-languageserver';
import { DidChangeConfigurationParams } from 'vscode-languageserver-protocol';
import { ExtensionSettings } from '../interfaces/extensionSettings';

export class SettingsManager {
  private connection: Connection;
  private hasConfigurationCapability;

  // cache of document settings per workspace file
  private documentSettings: Map<string, Thenable<ExtensionSettings>> =
    new Map();

  private defaultSettings: ExtensionSettings = {
    ansible: { path: 'ansible' },
    ansibleLint: { enabled: true, path: 'ansible-lint' },
  };
  private globalSettings: ExtensionSettings = this.defaultSettings;

  constructor(connection: Connection, hasConfigurationCapability: boolean) {
    this.connection = connection;
    this.hasConfigurationCapability = hasConfigurationCapability;
  }

  public get(uri: string): Thenable<ExtensionSettings> {
    if (!this.hasConfigurationCapability) {
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

  public handleConfigurationChanged(
    change: DidChangeConfigurationParams
  ): void {
    this.documentSettings.clear();
    if (this.hasConfigurationCapability) {
      // Reset all cached document settings
      this.documentSettings.clear();
    } else {
      this.globalSettings =
        change.settings.languageServerExample || this.defaultSettings;
    }
  }
}
