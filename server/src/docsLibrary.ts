import { collectionModuleFilter, DocsParser } from './docsParser';
import * as _ from 'lodash';
import * as path from 'path';
import { WorkspaceFolder } from 'vscode-languageserver';
import { IContext } from './context';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { hasOwnProperty } from './utils';
import { YAMLError } from 'yaml/util';
export class DocsLibrary {
  private modules = new Map<string, IModuleMetadata>();
  private docFragments = new Map<string, IModuleMetadata>();
  private context: IContext;
  private workspace: WorkspaceFolder | undefined;

  constructor(context: IContext, workspace?: WorkspaceFolder) {
    this.context = context;
    this.workspace = workspace;
  }

  public async initialize(): Promise<void> {
    // this._workspace.uri;
    for (const modulesPath of this.context.ansibleConfig.module_locations) {
      (await DocsParser.parseDirectory(modulesPath, 'builtin')).forEach(
        (doc) => {
          this.modules.set(doc.fqcn, doc);
        }
      );
      (
        await DocsParser.parseDirectory(modulesPath, 'builtin_doc_fragment')
      ).forEach((doc) => {
        this.docFragments.set(doc.fqcn, doc);
      });
    }
    for (const collectionsPath of this.context.ansibleConfig
      .collections_paths) {
      (await DocsParser.parseDirectory(collectionsPath, 'collection')).forEach(
        (doc) => {
          this.modules.set(doc.fqcn, doc);
        }
      );
      (
        await DocsParser.parseDirectory(
          collectionsPath,
          'collection_doc_fragment'
        )
      ).forEach((doc) => {
        this.docFragments.set(doc.fqcn, doc);
      });
    }
  }

  private async findModule(
    searchText: string,
    doc: TextDocument
  ): Promise<IModuleMetadata | undefined> {
    const prefixOptions = [
      '', // try searching as-is (FQCN match)
      'ansible.builtin.', // try searching built-in
    ];
    const metadata = await this.context.documentMetadata.get(doc.uri);
    if (metadata) {
      // try searching declared collections
      prefixOptions.push(...metadata.collections.map((s) => `${s}.`));
    }
    const prefix = prefixOptions.find((prefix) =>
      this.modules.has(prefix + searchText)
    );
    const module = this.modules.get(prefix + searchText);
    // Collect information from documentation fragments
    if (module && !module.fragments) {
      module.fragments = [];
      if (
        hasOwnProperty(module.contents, 'extends_documentation_fragment') &&
        module.contents.extends_documentation_fragment instanceof Array
      ) {
        const resultContents = {};
        for (const docFragmentName of module.contents
          .extends_documentation_fragment) {
          const docFragment = this.docFragments.get(docFragmentName);
          if (docFragment) {
            module.fragments.push(docFragment); // currently used only as indicator
            _.mergeWith(
              resultContents,
              docFragment.contents,
              this.docFragmentMergeCustomizer
            );
          }
        }
        _.mergeWith(
          resultContents,
          module.contents,
          this.docFragmentMergeCustomizer
        );
        module.contents = resultContents;
      }
    }
    return module;
  }

  private docFragmentMergeCustomizer(
    objValue: unknown,
    srcValue: unknown,
    key: string
  ): Record<PropertyKey, unknown>[] | undefined {
    if (
      ['notes', 'requirements', 'seealso'].includes(key) &&
      _.isArray(objValue)
    ) {
      return objValue.concat(srcValue);
    }
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
        // TODO: perform typechecking
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ([optionName, optionObj]: [string, any]) => {
          return {
            name: optionName,
            description: optionObj.description,
            required: !!optionObj.required,
            default: optionObj.default,
            choices: optionObj.choices,
            type: optionObj.type,
            elements: optionObj.elements,
            aliases: optionObj.aliases,
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
export interface IModuleDocumentation {
  module: string;
  shortDescription: IDescription;
  description: IDescription;
  versionAdded: string;
  author: IDescription;
  deprecated: Record<string, unknown>;
  options: IOption[];
  requirements: IDescription;
  seealso: Record<string, unknown>;
  notes: IDescription;
}

export interface IModuleMetadata {
  source: string;
  fqcn: string;
  namespace: string;
  collection: string;
  name: string;
  contents: Record<string, unknown>;
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
  version_added?: string;
  suboptions?: unknown;
}

// const test = new DocsLibrary();
// test.initialize().then(() => {
//   console.log(test.builtInModules);
// });
