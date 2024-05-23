import * as fs from "fs";
import * as path from "path";
import { parseDocument } from "yaml";
import { LazyModuleDocumentation, parseRawRouting } from "./docsParser";
import { IModuleMetadata } from "../interfaces/module";
import {
  IPluginRoutesByType,
  IPluginRoutingByCollection,
} from "../interfaces/pluginRouting";
import { globArray } from "./pathUtils";

export async function findDocumentation(
  dir: string,
  kind:
    | "builtin"
    | "collection"
    | "builtin_doc_fragment"
    | "collection_doc_fragment",
): Promise<IModuleMetadata[]> {
  if (!fs.existsSync(dir) || fs.lstatSync(dir).isFile()) {
    return [];
  }
  let files;
  switch (kind) {
    case "builtin":
      files = await globArray([`${dir}/**/*.py`, "!/**/_*.py"]);
      break;
    case "builtin_doc_fragment":
      files = await globArray([
        `${path.resolve(dir, "../")}/plugins/doc_fragments/*.py`,
        "!/**/_*.py",
      ]);
      break;
    case "collection":
      files = await globArray([
        `${dir}/ansible_collections/*/*/plugins/modules/*.py`,
        `${dir}/ansible_collections/*/*/plugins/modules/**/*.py`,
        `!${dir}/ansible_collections/*/*/plugins/modules/_*.py`,
        `!${dir}/ansible_collections/*/*/plugins/modules/**/_*.py`,
      ]).filter((item) => !fs.lstatSync(item).isSymbolicLink());
      break;
    case "collection_doc_fragment":
      files = await globArray([
        `${dir}/ansible_collections/*/*/plugins/doc_fragments/*.py`,
        `!${dir}/ansible_collections/*/*/plugins/doc_fragments/_*.py`,
      ]);
      break;
  }
  return files.map((file) => {
    const name = path.basename(file, ".py");
    let namespace;
    let collection;
    switch (kind) {
      case "builtin":
      case "builtin_doc_fragment":
        namespace = "ansible";
        collection = "builtin";
        break;
      case "collection":
      case "collection_doc_fragment": {
        const pathArray = file.split(path.sep);
        const pluginsDirIndex = pathArray.indexOf("plugins");
        namespace = pathArray[pluginsDirIndex - 2];
        collection = pathArray[pluginsDirIndex - 1];
        if (pathArray.length > pluginsDirIndex + 3) {
          const subCollectionArray = pathArray.slice(
            pluginsDirIndex + 2,
            pathArray.length - 1,
          );
          collection = `${collection}.${subCollectionArray.join(".")}`;
        }
        break;
      }
    }

    return new LazyModuleDocumentation(
      file,
      `${namespace}.${collection}.${name}`,
      namespace,
      collection,
      name,
    );
  });
}

export async function findPluginRouting(
  dir: string,
  kind: "builtin" | "collection",
): Promise<IPluginRoutingByCollection> {
  const pluginRouting = new Map<string, IPluginRoutesByType>();
  if (!fs.existsSync(dir) || fs.lstatSync(dir).isFile()) {
    return pluginRouting;
  }
  let files;
  switch (kind) {
    case "builtin":
      files = await globArray([`${dir}/config/ansible_builtin_runtime.yml`]);
      break;
    case "collection":
      files = await globArray([
        `${dir}/ansible_collections/*/*/meta/runtime.yml`,
      ]);
      break;
  }
  for (const file of files) {
    let collection;
    switch (kind) {
      case "builtin": {
        collection = "ansible.builtin";
        break;
      }
      case "collection": {
        const pathArray = file.split(path.sep);
        collection = `${pathArray[pathArray.length - 4]}.${
          pathArray[pathArray.length - 3]
        }`;
        break;
      }
    }
    const runtimeContent = await fs.promises.readFile(file, {
      encoding: "utf8",
    });
    const document = parseDocument(runtimeContent).toJSON();
    pluginRouting.set(collection, parseRawRouting(document));
  }

  return pluginRouting;
}
