import {
  collectionModuleFilter,
  DocsParser,
  IModuleDocumentation,
} from './docsParser';
import * as path from 'path';
import { WorkspaceFolder } from 'vscode-languageserver';
import { AnsibleConfig } from './ansibleConfig';
export class DocsLibrary {
  private _builtInModules = new Map<string, IModuleDocumentation>();
  private _collectionModules = new Map<string, IModuleDocumentation>();
  private _config: AnsibleConfig;
  private _workspace: WorkspaceFolder | undefined;

  constructor(config: AnsibleConfig, workspace?: WorkspaceFolder) {
    this._config = config;
    this._workspace = workspace;
  }

  public async initialize(): Promise<void> {
    // this._workspace.uri;
    this._config.module_locations.forEach(async (modulesPath) => {
      const docs = await DocsParser.parseDirectory(modulesPath, 'builtin');
      docs.forEach((doc) => {
        this._builtInModules.set(doc.name, doc);
      });
    });
    this._config.collections_paths.forEach(async (collectionsPath) => {
      const docs = await DocsParser.parseDirectory(
        collectionsPath,
        'collection'
      );
      docs.forEach((doc) => {
        this._collectionModules.set(doc.name, doc);
      });
    });
  }

  public getModuleDescription(module: string): IDescription | undefined {
    const doc = this._builtInModules.get(module);
    return doc?.contents.description;
  }

  public getModuleOptions(module: string): IOption[] | undefined {
    const doc = this._builtInModules.get(module);
    const options = doc?.contents.options;
    if (options) {
      return Object.entries(options).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ([optionName, optionObj]: [string, any]) => {
          return {
            name: optionName,
            description: optionObj.description,
            required: !!optionObj.required,
            choices: optionObj.choices,
          };
        }
      );
    }
  }

  public getModuleOption(module: string, option: string): IOption | undefined {
    const doc = this._builtInModules.get(module);
    const optionObj = doc?.contents.options[option];
    if (optionObj) {
      return {
        name: option,
        description: optionObj.description,
        required: !!optionObj.required,
        choices: optionObj.choices,
      };
    }
  }

  public isModule(module: string): boolean {
    return this._builtInModules.has(module);
  }
}

export type IDescription = string | Array<string>;

export interface IOption {
  name: string;
  description?: IDescription;
  required: boolean;
  default?: unknown;
  choices?: Array<unknown>;
  type?: string;
  elements?: string;
  aliases?: Array<string>;
  version_added?: string;
  suboptions?: unknown;
}

// const test = new DocsLibrary();
// test.initialize().then(() => {
//   console.log(test.builtInModules);
// });
