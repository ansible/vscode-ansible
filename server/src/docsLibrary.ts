import { DocsParser, IDocumentation } from './docsParser';
import * as path from 'path';
import { WorkspaceFolder } from 'vscode-languageserver';
import { AnsibleConfig } from './ansibleConfig';
export class DocsLibrary {
  private builtInModules = new Map<string, IDocumentation>();
  // private config: AnsibleConfig = null;
  private _workspace;

  constructor(workspace?: WorkspaceFolder) {
    this._workspace = workspace;
  }

  public async initialize(): Promise<void> {
    // this._workspace.uri;

    const ansibleLibPath = '/usr/local/lib/python3.6/dist-packages/ansible';
    const modulesPath = path.join(ansibleLibPath, 'modules');
    const docs = await DocsParser.parseDirectory(modulesPath);
    docs.forEach((doc) => {
      this.builtInModules.set(doc.module, doc);
    });
  }

  public getModuleDescription(module: string): IDescription | undefined {
    const doc = this.builtInModules.get(module);
    return doc?.contents.description;
  }

  public getModuleOptions(module: string): IOption[] | undefined {
    const doc = this.builtInModules.get(module);
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
    const doc = this.builtInModules.get(module);
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
    return this.builtInModules.has(module);
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
