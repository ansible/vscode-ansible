import * as vscode from "vscode";
import {
  Uri,
  workspace,
  FileSystemError,
  ViewColumn,
  window,
  commands,
} from "vscode";
import { expandPath } from "../../../contentCreator/utils";
import { CollectionFinder, AnsibleCollection } from "../../utils/scanner";

export async function openNewPlaybookEditor(content: string) {
  const options = {
    language: "ansible",
    content: content,
  };

  const doc = await workspace.openTextDocument(options);
  await window.showTextDocument(doc, ViewColumn.Active);
}

export async function getCollectionsFromWorkspace(): Promise<
  AnsibleCollection[]
> {
  const workspaceFolders = workspace.workspaceFolders;

  if (!workspaceFolders) {
    return [];
  }
  const workspaceDirectories = workspaceFolders.map((f) => f.uri.fsPath);
  const collectionFinder = new CollectionFinder(workspaceDirectories);
  await collectionFinder.refreshCache();
  return collectionFinder.cache;
}

export async function getRoleBaseDir(
  collectionName: string,
  roleName: string,
): Promise<Uri> {
  const collectionFound = await getCollectionsFromWorkspace();
  const collectionMatch = collectionFound.filter(
    (e) => e.fqcn === collectionName,
  );
  if (collectionMatch.length === 0) {
    throw new Error("Collection not found in the workspace!");
  } else if (collectionMatch.length !== 1) {
    throw new Error(
      `Too many directories found for collection ${collectionName}!`,
    );
  }
  const roleBaseDirUri = Uri.file(
    `${collectionMatch[0].path}/roles/${roleName}`,
  );
  return roleBaseDirUri;
}

export async function fileExists(uri: Uri): Promise<boolean> {
  try {
    await workspace.fs.stat(uri);
  } catch (e) {
    if (e instanceof FileSystemError && e.code === "FileNotFound") {
      return false;
    }
  }
  return true;
}

export class FileOperations {
  public async openLogFile(fileUrl: string) {
    const logFileUrl = vscode.Uri.file(expandPath(fileUrl)).fsPath;
    const parsedUrl = vscode.Uri.parse(`vscode://file${logFileUrl}`);
    this.openFileInEditor(parsedUrl.toString());
  }

  public openFileInEditor(fileUrl: string) {
    const updatedUrl = expandPath(String(fileUrl));
    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(updatedUrl));
  }

  private async openFolderInWorkspaceCore(folderUrl: string): Promise<void> {
    const folderUri = Uri.parse(expandPath(folderUrl));

    if (workspace.workspaceFolders?.length === 0) {
      workspace.updateWorkspaceFolders(0, null, { uri: folderUri });
    } else {
      await commands.executeCommand("vscode.openFolder", folderUri, {
        forceNewWindow: true,
      });
    }
  }

  public async openFolderInWorkspaceRole(folderUrl: string, roleName: string) {
    await this.openFolderInWorkspaceCore(folderUrl);

    const mainFileUrl = `${folderUrl}/roles/${roleName}/meta/main.yml`;
    console.log(`[ansible-creator] main.yml file url: ${mainFileUrl}`);
    const parsedUrl = Uri.parse(`vscode://file${mainFileUrl}`);
    console.log(`[ansible-creator] Parsed main.yml file url: ${parsedUrl}`);
    this.openFileInEditor(parsedUrl.toString());
  }

  public async openFolderInWorkspacePlugin(
    folderUrl: string,
    pluginName: string,
    pluginType: string,
  ) {
    await this.openFolderInWorkspaceCore(folderUrl);
    const pluginTypeDir =
      pluginType.toLowerCase() === "module"
        ? "modules"
        : pluginType.toLowerCase();
    const pluginFileUrl = `${folderUrl}/plugins/${pluginTypeDir}/${pluginName}.py`;
    const parsedUrl = vscode.Uri.parse(`vscode://file${pluginFileUrl}`);
    this.openFileInEditor(parsedUrl.toString());
  }

  public async openFolderInWorkspaceProjects(folderUrl: string) {
    await this.openFolderInWorkspaceCore(folderUrl);

    // Determine which file to open based on what was created
    const galaxyFileUri = Uri.joinPath(Uri.parse(folderUrl), "galaxy.yml");
    const siteFileUri = Uri.joinPath(Uri.parse(folderUrl), "site.yml");

    let targetFileUrl: string;

    try {
      await workspace.fs.stat(galaxyFileUri);
      // galaxy.yml exists, so this is a collection
      targetFileUrl = galaxyFileUri.fsPath;
    } catch {
      try {
        await workspace.fs.stat(siteFileUri);
        // site.yml exists, so this is a playbook project
        targetFileUrl = siteFileUri.fsPath;
      } catch {
        // Neither exists, default to site.yml for playbook
        targetFileUrl = siteFileUri.fsPath;
      }
    }

    const parsedUrl = Uri.parse(`vscode://file${targetFileUrl}`);
    this.openFileInEditor(parsedUrl.toString());
  }

  public async openFolderInWorkspaceDevcontainer(folderUrl: string) {
    await this.openFolderInWorkspaceCore(folderUrl);

    const devcontainerFileUrl = `${folderUrl}/.devcontainer/devcontainer.json`;
    const parsedUrl = Uri.parse(`vscode://file${devcontainerFileUrl}`);
    this.openFileInEditor(parsedUrl.toString());
  }

  public async openDevfile(fileUrl: string) {
    const updatedUrl = expandPath(fileUrl);
    const parsedUrl = Uri.parse(`vscode://file${updatedUrl}`);
    this.openFileInEditor(parsedUrl.toString());
  }
}
