import { Connection } from "vscode-languageserver";
import { Node } from "yaml";
import { getDeclaredCollections } from "../utils/yaml";
import { findDocumentation, findPluginRouting } from "../utils/docsFinder";
import { WorkspaceFolderContext } from "./workspaceManager";
import {
  IPluginRoute,
  IPluginRoutesByType,
  IPluginRoutingByCollection,
} from "../interfaces/pluginRouting";
import {
  processDocumentationFragments,
  processRawDocumentation,
} from "../utils/docsParser";
import { IModuleMetadata } from "../interfaces/module";
import * as path from "path";
import { existsSync, lstatSync } from "fs";
import { URI } from "vscode-uri";
import {
  findModulesUtils,
  getModuleFqcnsUtils,
} from "./docsLibraryUtilsForPAC";
import { globArray } from "../utils/pathUtils";
export class DocsLibrary {
  private connection: Connection;
  private modules = new Map<string, IModuleMetadata>();
  private _moduleFqcns = new Set<string>();
  private docFragments = new Map<string, IModuleMetadata>();
  private context: WorkspaceFolderContext;
  private pluginRouting: IPluginRoutingByCollection = new Map<
    string,
    IPluginRoutesByType
  >();

  constructor(connection: Connection, context: WorkspaceFolderContext) {
    this.connection = connection;
    this.context = context;
  }

  public async initialize(): Promise<void> {
    try {
      const settings = await this.context.documentSettings.get(
        this.context.workspaceFolder.uri,
      );
      const ansibleConfig = await this.context.ansibleConfig;
      if (settings.executionEnvironment.enabled) {
        // ensure plugin/module cache is established
        const executionEnvironment = await this.context.executionEnvironment;
        await executionEnvironment.fetchPluginDocs(ansibleConfig);
      }
      for (const modulesPath of ansibleConfig.module_locations) {
        await this.findDocumentationInModulesPath(modulesPath);
      }

      (
        await findPluginRouting(ansibleConfig.ansible_location, "builtin")
      ).forEach((r, collection) => this.pluginRouting.set(collection, r));

      for (const collectionsPath of ansibleConfig.collections_paths) {
        await this.findDocumentationInCollectionsPath(collectionsPath);
      }
    } catch (error) {
      if (error instanceof Error) {
        this.connection.window.showErrorMessage(error.message);
      } else {
        this.connection.console.error(
          `Exception in DocsLibrary service: ${JSON.stringify(error)}`,
        );
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
    documentUri?: string,
  ): Promise<[IModuleMetadata | undefined, string | undefined]> {
    // support playbook adjacent collections
    const playbookDirectory = URI.parse(String(documentUri)).path.split(
      path.sep,
    );
    playbookDirectory.pop();
    playbookDirectory.push("collections");

    const playbookAdjacentCollectionsPath = playbookDirectory.join(path.sep);

    const isAdjacentCollectionAvailable = existsSync(
      playbookAdjacentCollectionsPath,
    );

    // check if a module code is actually present or not
    const moduleFiles = globArray([
      `${playbookAdjacentCollectionsPath}/ansible_collections/*/*/plugins/modules/*.py`,
      `${playbookAdjacentCollectionsPath}/ansible_collections/*/*/plugins/modules/**/*.py`,
      `!${playbookAdjacentCollectionsPath}/ansible_collections/*/*/plugins/modules/_*.py`,
      `!${playbookAdjacentCollectionsPath}/ansible_collections/*/*/plugins/modules/**/_*.py`,
    ]).filter((item) => !lstatSync(item).isSymbolicLink());

    if (isAdjacentCollectionAvailable && moduleFiles.length !== 0) {
      const [PAModule, PAHitFqcn] = await findModulesUtils(
        playbookAdjacentCollectionsPath,
        searchText,
        this.context,
        contextPath,
        documentUri,
      );
      if (PAModule) {
        // return early if module found in playbook adjacent collection
        return [PAModule, PAHitFqcn];
      }
    }

    // Now, start finding the module
    let hitFqcn;
    const candidateFqcns = await this.getCandidateFqcns(
      searchText,
      documentUri,
      contextPath,
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
        module.documentation = processRawDocumentation(
          module.rawDocumentationFragments,
        );
      }
    }
    return [module, hitFqcn];
  }

  private async findDocumentationInModulesPath(modulesPath: string) {
    (await findDocumentation(modulesPath, "builtin")).forEach((doc) => {
      this.modules.set(doc.fqcn, doc);
      this._moduleFqcns.add(doc.fqcn);
    });

    (await findDocumentation(modulesPath, "builtin_doc_fragment")).forEach(
      (doc) => {
        this.docFragments.set(doc.fqcn, doc);
      },
    );
  }

  private async findDocumentationInCollectionsPath(collectionsPath: string) {
    (await findDocumentation(collectionsPath, "collection")).forEach((doc) => {
      this.modules.set(doc.fqcn, doc);
      this._moduleFqcns.add(doc.fqcn);
    });

    (
      await findDocumentation(collectionsPath, "collection_doc_fragment")
    ).forEach((doc) => {
      this.docFragments.set(doc.fqcn, doc);
    });

    (await findPluginRouting(collectionsPath, "collection")).forEach(
      (r, collection) => this.pluginRouting.set(collection, r),
    );

    // add all valid redirect routes as possible FQCNs
    for (const [collection, routesByType] of this.pluginRouting) {
      for (const [name, route] of routesByType.get("modules") || []) {
        if (route.redirect && !route.tombstone) {
          this._moduleFqcns.add(`${collection}.${name}`);
        }
      }
    }
  }

  private async getCandidateFqcns(
    searchText: string,
    documentUri: string | undefined,
    contextPath: Node[] | undefined,
  ) {
    const candidateFqcns = [];
    if (searchText.split(".").length >= 3) {
      candidateFqcns.push(searchText); // try searching as-is (FQCN match)
    } else {
      candidateFqcns.push(`ansible.builtin.${searchText}`); // try searching built-in

      if (documentUri) {
        const metadata = await this.context.documentMetadata.get(documentUri);
        if (metadata) {
          // try searching declared collections
          candidateFqcns.push(
            ...metadata.collections.map((c) => `${c}.${searchText}`),
          );
        }
      }

      if (contextPath) {
        candidateFqcns.push(
          ...getDeclaredCollections(contextPath).map(
            (c) => `${c}.${searchText}`,
          ),
        );
      }
    }
    return candidateFqcns;
  }

  public getModuleRoute(fqcn: string): IPluginRoute | undefined {
    const fqcn_array = fqcn.split(".");
    if (fqcn_array.length >= 3) {
      const [namespace, collection] = fqcn_array;
      const name = fqcn_array.slice(2).join(".");
      return this.pluginRouting
        .get(`${namespace}.${collection}`)
        ?.get("modules")
        ?.get(name);
    }
  }

  public async getModuleFqcns(documentUri: string): Promise<Set<string>> {
    // support playbook adjacent collections
    const playbookDirectory = URI.parse(documentUri).path.split(path.sep);
    playbookDirectory.pop();
    playbookDirectory.push("collections");

    const playbookAdjacentCollectionsPath = playbookDirectory.join(path.sep);

    const isAdjacentCollectionAvailable = existsSync(
      playbookAdjacentCollectionsPath,
    );

    if (isAdjacentCollectionAvailable) {
      const paModuleFqcns = await getModuleFqcnsUtils(
        playbookAdjacentCollectionsPath,
      );
      // return early if appended list
      return new Set([...this._moduleFqcns, ...paModuleFqcns]);
    }

    return this._moduleFqcns;
  }
}
