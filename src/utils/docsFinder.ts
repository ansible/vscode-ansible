import * as fs from "fs";
import * as path from "path";
import { parseDocument } from "yaml";
import { LazyModuleDocumentation, parseRawRouting } from "./docsParser";
import { IModuleMetadata } from "../interfaces/module";
import {
  IPluginRoutesByType,
  IPluginRoutingByCollection,
} from "../interfaces/pluginRouting";
import { glob } from "glob";

export async function findDocumentation(
  dir: string,
  kind:
    | "builtin"
    | "collection"
    | "builtin_doc_fragment"
    | "collection_doc_fragment"
): Promise<IModuleMetadata[]> {
  if (!fs.existsSync(dir) || fs.lstatSync(dir).isFile()) {
    return [];
  }
  // const globby = await getGlobby();
  let files;
  switch (kind) {
    case "builtin":
      files = await globArray([`${dir}/**/*.py`, "!/**/_*.py"]);
      // files2 = globArray([`${dir}/**/*.py`, "!/**/_*.py"]);
      // console.log(`globby files ${files.length} -> `, files);
      // console.log(`glob files ${files2.length} -> `, files2);
      break;
    case "builtin_doc_fragment":
      files = await globArray([
        `${path.resolve(dir, "../")}/plugins/doc_fragments/*.py`,
        "!/**/_*.py",
      ]);
      // files2 = globArray([
      //   `${path.resolve(dir, "../")}/plugins/doc_fragments/*.py`,
      //   "!/**/_*.py",
      // ]);
      // console.log(`globby files ${files.length} -> `, files);
      // console.log(`glob files ${files2.length} -> `, files2);
      break;
    case "collection":
      files = await globArray([
        `${dir}/ansible_collections/*/*/plugins/modules/*.py`,
        `!${dir}/ansible_collections/*/*/plugins/modules/_*.py`,
      ]);
      // files2 = globArray([
      //   `${dir}/ansible_collections/*/*/plugins/modules/*.py`,
      //   `!${dir}/ansible_collections/*/*/plugins/modules/_*.py`,
      // ]);
      // console.log(`globby files ${files.length} -> `, files);
      // console.log(`glob files ${files2.length} -> `, files2);
      break;
    case "collection_doc_fragment":
      files = await globArray([
        `${dir}/ansible_collections/*/*/plugins/doc_fragments/*.py`,
        `!${dir}/ansible_collections/*/*/plugins/doc_fragments/_*.py`,
      ]);
      // files2 = globArray([
      //   `${dir}/ansible_collections/*/*/plugins/doc_fragments/*.py`,
      //   `!${dir}/ansible_collections/*/*/plugins/doc_fragments/_*.py`,
      // ]);
      // console.log(`globby files ${files.length} -> `, files);
      // console.log(`glob files ${files2.length} -> `, files2);
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
      case "collection_doc_fragment":
        const pathArray = file.split(path.sep);
        namespace = pathArray[pathArray.length - 5];
        collection = pathArray[pathArray.length - 4];
        break;
    }

    return new LazyModuleDocumentation(
      file,
      `${namespace}.${collection}.${name}`,
      namespace,
      collection,
      name
    );
  });
}

export async function findPluginRouting(
  dir: string,
  kind: "builtin" | "collection"
): Promise<IPluginRoutingByCollection> {
  const pluginRouting = new Map<string, IPluginRoutesByType>();
  if (!fs.existsSync(dir) || fs.lstatSync(dir).isFile()) {
    return pluginRouting;
  }
  // const globby = await getGlobby();
  let files;
  switch (kind) {
    case "builtin":
      files = await globArray([`${dir}/config/ansible_builtin_runtime.yml`]);
      // files2 = globArray([`${dir}/config/ansible_builtin_runtime.yml`]);
      // console.log(`globby files ${files.length} -> `, files);
      // console.log(`glob files ${files2.length} -> `, files2);
      break;
    case "collection":
      files = await globArray([
        `${dir}/ansible_collections/*/*/meta/runtime.yml`,
      ]);
      // files2 = globArray([`${dir}/ansible_collections/*/*/meta/runtime.yml`]);
      // console.log(`globby files ${files.length} -> `, files);
      // console.log(`glob files ${files2.length} -> `, files2);
      break;
  }
  for (const file of files) {
    let collection;
    switch (kind) {
      case "builtin":
        collection = "ansible.builtin";
        break;
      case "collection":
        const pathArray = file.split(path.sep);
        collection = `${pathArray[pathArray.length - 4]}.${
          pathArray[pathArray.length - 3]
        }`;
        break;
    }
    const runtimeContent = await fs.promises.readFile(file, {
      encoding: "utf8",
    });
    const document = parseDocument(runtimeContent).toJSON();
    pluginRouting.set(collection, parseRawRouting(document));
  }

  return pluginRouting;
}

/**
 * A glob utility function that that accepts array of patterns and also
 * excludes matching patterns that begin with '!' from the returned array
 * @param arrayOfPatterns array of patterns
 * @returns matched files
 */
export function globArray(arrayOfPatterns: string[]): string[] {
  // Patterns to be matched
  const matchPatterns = arrayOfPatterns.filter(
    (pattern) => !pattern.startsWith("!")
  );

  // Patterns to be excluded
  const ignorePatterns = arrayOfPatterns
    .filter((pattern) => pattern.startsWith("!"))
    .map((item) => item.slice(1));

  let matchFiles = [];
  matchPatterns.forEach((pattern) => {
    const matchedFiles = glob.sync(pattern);
    matchFiles = matchFiles.concat(matchedFiles);
  });
  const matchFilesSet = new Set(matchFiles);

  if (ignorePatterns.length === 0) {
    return [...matchFilesSet];
  } else {
    let matchFilesAfterExclusion = [];
    matchPatterns.forEach((pattern) => {
      const ignoredFiles = glob.sync(pattern, {
        ignore: ignorePatterns,
      });
      matchFilesAfterExclusion = matchFilesAfterExclusion.concat(ignoredFiles);
    });
    const matchFilesAfterExclusionSet = new Set(matchFilesAfterExclusion);
    return [...matchFilesAfterExclusionSet];
  }
}
