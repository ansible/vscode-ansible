import {
  collectionModuleFilter,
  DocsParser,
  IModuleDocumentation,
} from './docsParser';
import * as _ from 'lodash';
import * as path from 'path';
import { WorkspaceFolder } from 'vscode-languageserver';
import { IContext } from './context';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { hasOwnProperty } from './utils';
export class DocsLibrary {
  private _modules = new Map<string, IModuleDocumentation>();
  private _context: IContext;
  private _workspace: WorkspaceFolder | undefined;

  constructor(context: IContext, workspace?: WorkspaceFolder) {
    this._context = context;
    this._workspace = workspace;
  }

  public async initialize(): Promise<void> {
    // this._workspace.uri;
    this._context.ansibleConfig.module_locations.forEach(
      async (modulesPath) => {
        const docs = await DocsParser.parseDirectory(modulesPath, 'builtin');
        docs.forEach((doc) => {
          this._modules.set(doc.fqcn, doc);
        });
      }
    );
    this._context.ansibleConfig.collections_paths.forEach(
      async (collectionsPath) => {
        const docs = await DocsParser.parseDirectory(
          collectionsPath,
          'collection'
        );
        docs.forEach((doc) => {
          this._modules.set(doc.fqcn, doc);
        });
      }
    );
  }

  private async findModule(
    searchText: string,
    doc: TextDocument
  ): Promise<IModuleDocumentation | undefined> {
    const prefixOptions = [
      '', // try searching as-is (FQCN match)
      'ansible.builtin.', // try searching built-in
    ];
    const metadata = await this._context.documentMetadata.get(doc.uri);
    if (metadata) {
      // try searching declared collections
      prefixOptions.push(...metadata.collections.map((s) => `${s}.`));
    }
    const prefix = prefixOptions.find((prefix) =>
      this._modules.has(prefix + searchText)
    );
    return this._modules.get(prefix + searchText);
  }

  public async getModuleDescription(
    module: string,
    doc: TextDocument
  ): Promise<IDescription | undefined> {
    const contents = (await this.findModule(module, doc))?.contents;
    if (
      hasOwnProperty(contents, 'description') &&
      (contents.description instanceof Array || // won't check that all elements are string
        typeof contents.description === 'string')
    )
      return contents.description;
  }

  public async getModuleOptions(
    module: string,
    doc: TextDocument
  ): Promise<IOption[] | undefined> {
    const moduleDoc = await this.findModule(module, doc);
    const options = moduleDoc?.contents.options;
    if (options && typeof options === 'object') {
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

  public async getModuleOption(
    module: string,
    doc: TextDocument,
    option: string
  ): Promise<IOption | undefined> {
    const options = (await this.findModule(module, doc))?.contents.options;
    if (hasOwnProperty(options, option)) {
      const optionObj = options[option];
      const optionDoc: IOption = {
        name: option,
        required: !!(
          hasOwnProperty(optionObj, 'required') && optionObj.required
        ),
      };
      if (
        hasOwnProperty(optionObj, 'description') &&
        isIDescription(optionObj.description)
      )
        optionDoc.description = optionObj.description;
      if (
        hasOwnProperty(optionObj, 'choices') &&
        optionObj.choices instanceof Array
      )
        optionDoc.choices = optionObj.choices;

      return optionDoc;
    }
  }

  public async isModule(module: string, doc: TextDocument): Promise<boolean> {
    return !!(await this.findModule(module, doc));
  }
}

export type IDescription = string | Array<string>;

function isIDescription(obj: unknown): obj is IDescription {
  return (
    obj instanceof Array || // won't check that all elements are string
    typeof obj === 'string'
  );
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
  version_added?: string;
  suboptions?: unknown;
}

// const test = new DocsLibrary();
// test.initialize().then(() => {
//   console.log(test.builtInModules);
// });
