import * as _ from 'lodash';
import { Node } from 'yaml/types';
import { YAMLError } from 'yaml/util';
import { hasOwnProperty, isObject } from '../utils/misc';
import { getDeclaredCollections } from '../utils/yaml';
import { DocsFinder } from './docsFinder';
import { WorkspaceFolderContext } from './workspaceManager';
export class DocsLibrary {
  private modules = new Map<string, IModuleMetadata>();
  private _moduleFqcns = new Set<string>();
  private docFragments = new Map<string, IModuleMetadata>();
  private context: WorkspaceFolderContext;
  private pluginRouting: IPluginRoutingByCollection = new Map<
    string,
    IPluginRoutesByType
  >();

  constructor(context: WorkspaceFolderContext) {
    this.context = context;
  }

  public async initialize(): Promise<void> {
    const ansibleConfig = await this.context.ansibleConfig;
    for (const modulesPath of ansibleConfig.module_locations) {
      (await DocsFinder.findDocumentation(modulesPath, 'builtin')).forEach(
        (doc) => {
          this.modules.set(doc.fqcn, doc);
          this.moduleFqcns.add(doc.fqcn);
        }
      );

      (
        await DocsFinder.findDocumentation(modulesPath, 'builtin_doc_fragment')
      ).forEach((doc) => {
        this.docFragments.set(doc.fqcn, doc);
      });
    }

    (
      await DocsFinder.findPluginRouting(
        ansibleConfig.ansible_location,
        'builtin'
      )
    ).forEach((r, collection) => this.pluginRouting.set(collection, r));

    for (const collectionsPath of ansibleConfig.collections_paths) {
      (
        await DocsFinder.findDocumentation(collectionsPath, 'collection')
      ).forEach((doc) => {
        this.modules.set(doc.fqcn, doc);
        this.moduleFqcns.add(doc.fqcn);
      });

      (
        await DocsFinder.findDocumentation(
          collectionsPath,
          'collection_doc_fragment'
        )
      ).forEach((doc) => {
        this.docFragments.set(doc.fqcn, doc);
      });

      (
        await DocsFinder.findPluginRouting(collectionsPath, 'collection')
      ).forEach((r, collection) => this.pluginRouting.set(collection, r));

      // add all valid redirect routes as possible FQCNs
      for (const [collection, routesByType] of this.pluginRouting) {
        for (const [name, route] of routesByType.get('modules') || []) {
          if (route.redirect && !route.tombstone) {
            this.moduleFqcns.add(`${collection}.${name}`);
          }
        }
      }
    }
  }

  /**
   * Tries to find an Ansible module for a given name or FQCN.
   *
   * Parameters `contextPath` and `documentUri` are used to obtain contextual
   * information on declared collections. Hence these are not needed when
   * searching with FQCN.
   *
   * Returns the module if found and an FQCN for which either a module or a
   * route has been found.
   */
  public async findModule(
    searchText: string,
    contextPath?: Node[],
    documentUri?: string
  ): Promise<[IModuleMetadata | undefined, string | undefined]> {
    let hitFqcn;
    const candidateFqcns = await this.getCandidateFqcns(
      searchText,
      documentUri,
      contextPath
    );

    // check routing
    let moduleRoute;
    for (const fqcn of candidateFqcns) {
      moduleRoute = this.getModuleRoute(fqcn);
      if (moduleRoute) {
        hitFqcn = fqcn;
        break; // find first
      }
    }

    // find module
    let module;
    if (moduleRoute && moduleRoute.redirect) {
      module = this.modules.get(moduleRoute.redirect);
    } else {
      for (const fqcn of candidateFqcns) {
        module = this.modules.get(fqcn);
        if (module) {
          if (!hitFqcn) {
            hitFqcn = fqcn;
          }
          break; // find first
        }
      }
    }

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
    return [module, hitFqcn];
  }

  private async getCandidateFqcns(
    searchText: string,
    documentUri: string | undefined,
    contextPath: Node[] | undefined
  ) {
    const candidateFqcns = [];
    if (searchText.split('.').length === 3) {
      candidateFqcns.push(searchText); // try searching as-is (FQCN match)
    } else {
      candidateFqcns.push(`ansible.builtin.${searchText}`); // try searching built-in

      if (documentUri) {
        const metadata = await this.context.documentMetadata.get(documentUri);
        if (metadata) {
          // try searching declared collections
          candidateFqcns.push(
            ...metadata.collections.map((c) => `${c}.${searchText}`)
          );
        }
      }

      if (contextPath) {
        candidateFqcns.push(
          ...getDeclaredCollections(contextPath).map(
            (c) => `${c}.${searchText}`
          )
        );
      }
    }
    return candidateFqcns;
  }

  public getModuleRoute(fqcn: string): IPluginRoute | undefined {
    const fqcn_array = fqcn.split('.');
    if (fqcn_array.length === 3) {
      const [namespace, collection, name] = fqcn_array;
      return this.pluginRouting
        .get(`${namespace}.${collection}`)
        ?.get('modules')
        ?.get(name);
    }
  }

  get moduleFqcns(): Set<string> {
    return this._moduleFqcns;
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
}

export type IDescription = string | Array<unknown>;

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
  route?: IPluginRoute;
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

export type IPluginRoutingByCollection = Map<string, IPluginRoutesByType>;

export type IPluginTypes = 'modules'; // currently only modules are supported

export type IPluginRoutesByType = Map<IPluginTypes, IPluginRoutesByName>;

export type IPluginRoutesByName = Map<string, IPluginRoute>;
export interface IPluginRoute {
  redirect?: string;
  deprecation?: {
    removalVersion?: string;
    removalDate?: string;
    warningText?: string;
  };
  tombstone?: {
    removalVersion?: string;
    removalDate?: string;
    warningText?: string;
  };
}
