import { AnsibleConfig } from '../services/ansibleConfig';
import { IDocumentMetadata } from './documentMeta';
import { ExtensionSettings } from './extensionSettings';

export interface IContext {
  ansibleConfig: AnsibleConfig;
  documentMetadata: Map<string, Thenable<IDocumentMetadata>>;
  documentSettings: Map<string, Thenable<ExtensionSettings>>;
}
