import { CollectionFinder } from "../utils/scanner";
import { workspace } from "vscode";

export async function getCollectionsFromWorkspace() {
  const workspaceFolders = workspace.workspaceFolders;
  let collectionsFound: string[] = [];
  if (workspaceFolders) {
    const workspaceDirectories = workspaceFolders.map((f) => f.uri.fsPath);
    const collectionFinder = new CollectionFinder(workspaceDirectories);
    await collectionFinder.refreshCache();
    collectionsFound = collectionFinder.cache.map(
      (i) => `${i.namespace}.${i.name}`,
    );
  }
  return collectionsFound;
}
