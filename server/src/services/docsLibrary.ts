import * as _ from 'lodash';
import { WorkspaceFolder } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { YAMLError } from 'yaml/util';
import { IContext } from '../interfaces/context';
import { hasOwnProperty, isObject } from '../utils/misc';
import { DocsParser } from './docsParser';
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

  public async findModule(
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
    if (module) {
      if (!module.fragments) {
        // collect information from documentation fragments
        this.processDocumentationFragments(module);
      }
      if (!module.documentation) {
        // translate raw documentation into a typed structure
        module.documentation = this.processRawDocumentation(
          module.rawDocumentation
        );
      }
    }
    return module;
  }

  private processDocumentationFragments(module: IModuleMetadata) {
    module.fragments = [];
    if (
      hasOwnProperty(
        module.rawDocumentation,
        'extends_documentation_fragment'
      ) &&
      module.rawDocumentation.extends_documentation_fragment instanceof Array
    ) {
      const resultContents = {};
      for (const docFragmentName of module.rawDocumentation
        .extends_documentation_fragment) {
        const docFragment =
          this.docFragments.get(docFragmentName) ||
          this.docFragments.get(`ansible.builtin.${docFragmentName}`);
        if (docFragment) {
          module.fragments.push(docFragment); // currently used only as indicator
          _.mergeWith(
            resultContents,
            docFragment.rawDocumentation,
            this.docFragmentMergeCustomizer
          );
        }
      }
      _.mergeWith(
        resultContents,
        module.rawDocumentation,
        this.docFragmentMergeCustomizer
      );
      module.rawDocumentation = resultContents;
    }
  }

  private docFragmentMergeCustomizer(
    objValue: unknown,
    srcValue: unknown,
    key: string
  ): Record<string, unknown>[] | undefined {
    if (
      ['notes', 'requirements', 'seealso'].includes(key) &&
      _.isArray(objValue)
    ) {
      return objValue.concat(srcValue);
    }
  }

  private processRawDocumentation(
    rawDoc: unknown
  ): IModuleDocumentation | undefined {
    if (isObject(rawDoc) && typeof rawDoc.module === 'string') {
      const moduleDoc: IModuleDocumentation = {
        module: rawDoc.module,
        options: this.processRawOptions(rawDoc.options),
        deprecated: !!rawDoc.deprecated,
      };
      if (isIDescription(rawDoc.short_description))
        moduleDoc.shortDescription = rawDoc.short_description;
      if (isIDescription(rawDoc.description))
        moduleDoc.description = rawDoc.description;
      if (typeof rawDoc.version_added === 'string')
        moduleDoc.versionAdded = rawDoc.version_added;
      if (isIDescription(rawDoc.author)) moduleDoc.author = rawDoc.author;
      if (isIDescription(rawDoc.requirements))
        moduleDoc.requirements = rawDoc.requirements;
      if (typeof rawDoc.seealso === 'object')
        moduleDoc.seealso = rawDoc.seealso as Record<string, unknown>;
      if (isIDescription(rawDoc.notes)) moduleDoc.notes = rawDoc.notes;
      return moduleDoc;
    }
  }

  private processRawOptions(rawOptions: unknown): Map<string, IOption> {
    const options = new Map<string, IOption>();
    if (isObject(rawOptions)) {
      for (const [optionName, rawOption] of Object.entries(rawOptions)) {
        if (isObject(rawOption)) {
          const optionDoc: IOption = {
            name: optionName,
            required: !!rawOption.required,
            default: rawOption.default,
            suboptions: rawOption.suboptions,
          };
          if (isIDescription(rawOption.description))
            optionDoc.description = rawOption.description;
          if (rawOption.choices instanceof Array)
            optionDoc.choices = rawOption.choices;
          if (typeof rawOption.type === 'string')
            optionDoc.type = rawOption.type;
          if (typeof rawOption.elements === 'string')
            optionDoc.elements = rawOption.elements;
          if (rawOption.aliases instanceof Array)
            optionDoc.aliases = rawOption.aliases;
          if (typeof rawOption.version_added === 'string')
            optionDoc.versionAdded = rawOption.version_added;
          options.set(optionName, optionDoc);
          if (optionDoc.aliases) {
            for (const alias of optionDoc.aliases) {
              options.set(alias, optionDoc);
            }
          }
        }
      }
    }
    return options;
  }

  public async getModuleDescription(
    module: string,
    doc: TextDocument
  ): Promise<IDescription | undefined> {
    const contents = (await this.findModule(module, doc))?.rawDocumentation;
    if (
      hasOwnProperty(contents, 'description') &&
      (contents.description instanceof Array || // won't check if all elements are string
        typeof contents.description === 'string')
    )
      return contents.description;
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
