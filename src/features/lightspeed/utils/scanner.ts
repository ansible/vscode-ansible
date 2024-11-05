import * as path from "path";
import * as YAML from "yaml";

import { Dirent } from "fs";
import { readdir, readFile } from "node:fs/promises";

class AnsibleCollection {
  path: string;
  namespace: string;
  name: string;

  constructor(path: string, namespace: string, name: string) {
    this.path = path;
    this.namespace = namespace;
    this.name = name;
  }
}

export class CollectionFinder {
  public cache: AnsibleCollection[];
  workspacePaths: string[];
  initialized: boolean = false;

  constructor(workspacePaths: string[]) {
    this.cache = [];
    this.workspacePaths = workspacePaths;
  }

  async readCollectionMetaInformation(collectionPath: string) {
    const galaxyFile = path.join(collectionPath, "galaxy.yml");
    const fromGalaxyFile = readFile(galaxyFile, "utf8")
      .then((content) => YAML.parse(content))
      .then((info) => {
        return { namespace: info["namespace"], name: info["name"] };
      });

    const MANIFESTFile = path.join(collectionPath, "MANIFEST.json");
    const fromMANIFESTFile = readFile(MANIFESTFile, "utf8")
      .then((content) => JSON.parse(content))
      .then((info) => {
        return {
          namespace: info["collection_info"]["namespace"],
          name: info["collection_info"]["name"],
        };
      });

    const j = Promise.any([fromGalaxyFile, fromMANIFESTFile])
      .then((info) => {
        const shouldEndWith = `${info["namespace"]}/${info["name"]}`;
        if (!collectionPath.endsWith(`${info["namespace"]}/${info["name"]}`)) {
          console.debug(
            `[lightspeed] collect name and path mismatch: ${collectionPath} Vs ${shouldEndWith}`,
          );
        }
        return new AnsibleCollection(
          collectionPath,
          info["namespace"],
          info["name"],
        );
      })
      .catch((e) => {
        console.debug(
          `[lightspeed] Cannot find collection meta information in directory ${collectionPath}: ${e}`,
        );
        return null;
      });
    return j;
  }

  async searchNestedCollections() {
    const collectionsPath = path.join(
      this.workspacePaths[0],
      "collections/ansible_collections/",
    );
    const a = await readdir(collectionsPath, { withFileTypes: true })
      .then((namespaceDirectories: Dirent[]) => {
        return namespaceDirectories
          .filter((namespaceEntry) => namespaceEntry.isDirectory())
          .map((namespaceEntry) => {
            const namespaceName = namespaceEntry.name;
            const namespaceDirectory = path.join(
              namespaceEntry.parentPath,
              namespaceName,
            );
            return readdir(namespaceDirectory, { withFileTypes: true }).then(
              (collectionDirectories: Dirent[]) => {
                return collectionDirectories
                  .filter((entry) => entry.isDirectory())
                  .map((entry) =>
                    this.readCollectionMetaInformation(
                      path.join(entry.parentPath, entry.name),
                    ),
                  );
              },
            );
          });
      })
      .catch((e) => {
        console.debug(`Cannot open directory ${collectionsPath}: ${e}`);
        return [];
      });
    const r: AnsibleCollection[] = [];
    for (let i = 0; i < a.length; i++) {
      (await Promise.all(await a[i])).forEach((entry) => {
        if (entry instanceof AnsibleCollection) {
          r.push(entry);
        }
      });
    }
    return r;
  }

  public async refreshCache() {
    const compareCollection = (a: AnsibleCollection, b: AnsibleCollection) => {
      return `${a.namespace}.${a.name}`.localeCompare(
        `${b.namespace}.${b.name}`,
      );
    };

    const scanRootWorkspaces = await Promise.all(
      this.workspacePaths.map(async (path) =>
        this.readCollectionMetaInformation(path),
      ),
    ).then((values) => values.filter((x) => x != null));
    const scanPlaybookWorkspace = await this.searchNestedCollections();
    this.cache = [...scanRootWorkspaces, ...scanPlaybookWorkspace].sort(
      compareCollection,
    );
    this.initialized = true;
  }
}
