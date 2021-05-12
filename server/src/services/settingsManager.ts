import { promises as fs } from 'fs';
import { URL } from 'url';
import { Connection } from 'vscode-languageserver';
import {
  DidChangeConfigurationParams,
  DidChangeWatchedFilesParams,
} from 'vscode-languageserver-protocol';
import { parseAllDocuments } from 'yaml';
import { ValueSource } from '../interfaces/context';
import { IDocumentMetadata } from '../interfaces/documentMeta';
import { ExtensionSettings } from '../interfaces/extensionSettings';
import { fileExists, hasOwnProperty } from '../utils/misc';

export class SettingsManager
  implements ValueSource<string, Thenable<ExtensionSettings>>
{
  private connection: Connection;
  private hasConfigurationCapability;

  private documentSettings: Map<string, Thenable<ExtensionSettings>> =
    new Map();

  private defaultSettings: ExtensionSettings = { maxNumberOfProblems: 1000 };
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
        section: 'languageServerExample',
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
