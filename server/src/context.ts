import { AnsibleConfig } from './ansibleConfig';
import { DocumentMetadata } from './documentMeta';

export interface IContext {
  ansibleConfig: AnsibleConfig;
  documentMetadata: Map<string, Thenable<DocumentMetadata>>;
}
