/**
 * This is a utility file for docs library service that has functions to cater the services for
 * playbook adjacent collections.
 *
 * NOTE: 'PAC' in the filename stands for 'Playbook Adjacent Collections'
 */

import { Node } from "yaml";
import { IModuleMetadata } from "../interfaces/module";
import {
  IPluginRoute,
  IPluginRoutesByType,
  IPluginRoutingByCollection,
} from "../interfaces/pluginRouting";
import { findDocumentation, findPluginRouting } from "../utils/docsFinder";
import {
  processDocumentationFragments,
  processRawDocumentation,
} from "../utils/docsParser";
import { getDeclaredCollections } from "../utils/yaml";
import { WorkspaceFolderContext } from "./workspaceManager";

const playbookAdjacentPluginRouting: IPluginRoutingByCollection = new Map<
  string,
  IPluginRoutesByType
>();

export async function findModulesUtils(
  playbookAdjacentCollectionsPath: string,
  searchText: string,
  context: WorkspaceFolderContext,
  contextPath?: Node[],
  documentUri?: string,
): Promise<[IModuleMetadata | undefined, string | undefined]> {
  const playbookAdjacentModules = new Map<string, IModuleMetadata>();
  const playbookAdjacentModuleFqcns = new Set<string>();
  const playbookAdjacentDocFragments = new Map<string, IModuleMetadata>();

  // find documentation for PAC
  (
    await findDocumentation(playbookAdjacentCollectionsPath, "collection")
  ).forEach((doc) => {
    playbookAdjacentModules.set(doc.fqcn, doc);
    playbookAdjacentModuleFqcns.add(doc.fqcn);
  });

  (
    await findDocumentation(
      playbookAdjacentCollectionsPath,
      "collection_doc_fragment",
    )
  ).forEach((doc) => {
    playbookAdjacentDocFragments.set(doc.fqcn, doc);
  });

  (
    await findPluginRouting(playbookAdjacentCollectionsPath, "collection")
  ).forEach((r, collection) =>
    playbookAdjacentPluginRouting.set(collection, r),
  );

  // add all valid redirect routes as possible FQCNs
  for (const [collection, routesByType] of playbookAdjacentPluginRouting) {
    for (const [name, route] of routesByType.get("modules") || []) {
      if (route.redirect && !route.tombstone) {
        playbookAdjacentModuleFqcns.add(`${collection}.${name}`);
      }
    }
  }

  // Now, start finding the module
  let hitFqcn;
  const candidateFqcns = await getCandidateFqcns(
    searchText,
    documentUri,
    contextPath,
    context,
  );

  // check routing
  let moduleRoute;
  for (const fqcn of candidateFqcns) {
    moduleRoute = getModuleRoute(fqcn);
    if (moduleRoute) {
      hitFqcn = fqcn;
      break; // find first
    }
  }

  // find module
  let module;
  if (moduleRoute && moduleRoute.redirect) {
    module = playbookAdjacentModules.get(moduleRoute.redirect);
  } else {
    for (const fqcn of candidateFqcns) {
      module = playbookAdjacentModules.get(fqcn);
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
      processDocumentationFragments(module, playbookAdjacentDocFragments);
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

export async function getModuleFqcnsUtils(
  playbookAdjacentCollectionsPath: string,
): Promise<Set<string>> {
  const playbookAdjacentModules = new Map<string, IModuleMetadata>();
  const playbookAdjacentModuleFqcns = new Set<string>();
  const playbookAdjacentDocFragments = new Map<string, IModuleMetadata>();

  (
    await findDocumentation(playbookAdjacentCollectionsPath, "collection")
  ).forEach((doc) => {
    playbookAdjacentModules.set(doc.fqcn, doc);
    playbookAdjacentModuleFqcns.add(doc.fqcn);
  });

  (
    await findDocumentation(
      playbookAdjacentCollectionsPath,
      "collection_doc_fragment",
    )
  ).forEach((doc) => {
    playbookAdjacentDocFragments.set(doc.fqcn, doc);
  });

  (
    await findPluginRouting(playbookAdjacentCollectionsPath, "collection")
  ).forEach((r, collection) =>
    playbookAdjacentPluginRouting.set(collection, r),
  );

  // add all valid redirect routes as possible FQCNs
  for (const [collection, routesByType] of playbookAdjacentPluginRouting) {
    for (const [name, route] of routesByType.get("modules") || []) {
      if (route.redirect && !route.tombstone) {
        playbookAdjacentModuleFqcns.add(`${collection}.${name}`);
      }
    }
  }

  return playbookAdjacentModuleFqcns;
}

async function getCandidateFqcns(
  searchText: string,
  documentUri: string | undefined,
  contextPath: Node[] | undefined,
  context: WorkspaceFolderContext,
) {
  const candidateFqcns = [];
  if (searchText.split(".").length >= 3) {
    candidateFqcns.push(searchText); // try searching as-is (FQCN match)
  } else {
    candidateFqcns.push(`ansible.builtin.${searchText}`); // try searching built-in

    if (documentUri) {
      const metadata = await context.documentMetadata.get(documentUri);
      if (metadata) {
        // try searching declared collections
        candidateFqcns.push(
          ...metadata.collections.map((c) => `${c}.${searchText}`),
        );
      }
    }

    if (contextPath) {
      candidateFqcns.push(
        ...getDeclaredCollections(contextPath).map((c) => `${c}.${searchText}`),
      );
    }
  }
  return candidateFqcns;
}

function getModuleRoute(fqcn: string): IPluginRoute | undefined {
  const fqcn_array = fqcn.split(".");
  if (fqcn_array.length === 3) {
    const [namespace, collection, name] = fqcn_array;
    return playbookAdjacentPluginRouting
      .get(`${namespace}.${collection}`)
      ?.get("modules")
      ?.get(name);
  }
}
