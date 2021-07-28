import { YAMLError } from 'yaml/util';

export type IDescription = string | Array<unknown>;

export interface IModuleDocumentation {
  module: string;
  shortDescription?: IDescription;
  description?: IDescription;
  versionAdded?: string;
  author?: IDescription;
  deprecated: boolean;
  options: Map<string, IOption>;
  requirements?: IDescription;
  seealso?: Record<string, unknown>;
  notes?: IDescription;
}

export interface IModuleMetadata {
  source: string;
  sourceLineRange: [number, number];
  fqcn: string;
  namespace: string;
  collection: string;
  name: string;
  rawDocumentation: Record<string, unknown>;
  documentation?: IModuleDocumentation;
  fragments?: IModuleMetadata[];
  errors: YAMLError[];
}

export interface IOption {
  name: string;
  description?: IDescription;
  required: boolean;
  default?: unknown;
  choices?: Array<unknown>;
  type?: string;
  elements?: string;
  aliases?: Array<string>;
  versionAdded?: string;
  suboptions?: unknown;
}
