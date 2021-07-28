import { Node } from 'yaml/types';
import { getDeclaredCollections } from '../utils/yaml';
import { findDocumentation, findPluginRouting } from '../utils/docsFinder';
import { WorkspaceFolderContext } from './workspaceManager';
import {
  IPluginRoute,
  IPluginRoutesByType,
  IPluginRoutingByCollection,
} from '../interfaces/pluginRouting';
import {
  processDocumentationFragments,
  processRawDocumentation,
} from '../utils/docsParser';
import { IModuleMetadata } from '../interfaces/module';
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
      (await findDocumentation(modulesPath, 'builtin')).forEach((doc) => {
        this.modules.set(doc.fqcn, doc);
        this.moduleFqcns.add(doc.fqcn);
      });

      (await findDocumentation(modulesPath, 'builtin_doc_fragment')).forEach(
        (doc) => {
          this.docFragments.set(doc.fqcn, doc);
        }
      );
    }

    (
      await findPluginRouting(ansibleConfig.ansible_location, 'builtin')
    ).forEach((r, collection) => this.pluginRouting.set(collection, r));

    for (const collectionsPath of ansibleConfig.collections_paths) {
      (await findDocumentation(collectionsPath, 'collection')).forEach(
        (doc) => {
          this.modules.set(doc.fqcn, doc);
          this.moduleFqcns.add(doc.fqcn);
        }
      );

      (
        await findDocumentation(collectionsPath, 'collection_doc_fragment')
      ).forEach((doc) => {
        this.docFragments.set(doc.fqcn, doc);
      });

      (await findPluginRouting(collectionsPath, 'collection')).forEach(
        (r, collection) => this.pluginRouting.set(collection, r)
      );

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
        processDocumentationFragments(module, this.docFragments);
      }
      if (!module.documentation) {
        // translate raw documentation into a typed structure
        module.documentation = processRawDocumentation(module.rawDocumentation);
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
}
