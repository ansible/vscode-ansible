import { DocsParser, IDocumentation } from './docsParser';
import * as path from 'path';
export class DocsLibrary {
  private builtInModules = new Map<string, IDocumentation>();

  public async initialize(): Promise<void> {
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

  public getModuleOption(module: string, option: string): IOption | undefined {
    const doc = this.builtInModules.get(module);
    const optionObj = doc?.contents.options[option];
    if (optionObj) {
      return {
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
