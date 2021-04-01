import { AnsibleConfig } from '../services/ansibleConfig';
import { IDocumentMetadata } from './documentMeta';

export interface IContext {
  ansibleConfig: AnsibleConfig;
  documentMetadata: Map<string, Thenable<IDocumentMetadata>>;
}
