import type { Disposable, ExtensionContext, Webview } from "vscode";
import { v4 as uuidv4 } from "uuid";
import { CollectionFinder, AnsibleCollection } from "../../utils/scanner";

import { Uri, workspace, FileSystemError } from "vscode";
import { LightSpeedAPI } from "../../api";
import { IError } from "../../utils/errors";
import {
  RoleGenerationResponseParams,
  RoleGenerationListEntry,
} from "../../../../interfaces/lightspeed";

import { lightSpeedManager } from "../../../../extension";

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

async function getRoleBaseDir(
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

async function generateRole(
  apiInstance: LightSpeedAPI,
  text: string,
  outline: string,
  generationId: string,
): Promise<RoleGenerationResponseParams | IError> {
  const createOutline = outline.length === 0;

  const response: RoleGenerationResponseParams | IError =
    await apiInstance.roleGenerationRequest({
      text,
      outline: outline.length > 0 ? outline : undefined,
      createOutline,
      generationId,
      //wizardId,
    });
  return response;
}

async function fileExists(uri: Uri): Promise<boolean> {
  try {
    await workspace.fs.stat(uri);
  } catch (e) {
    if (e instanceof FileSystemError && e.code === "FileNotFound") {
      return false;
    }
  }
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class WebviewHelper {
  public static setupHtml(webview: Webview, context: ExtensionContext) {
    return process.env.VITE_DEV_SERVER_URL
      ? __getWebviewHtml__(
          `${process.env.VITE_DEV_SERVER_URL}webviews/lightspeed/role-generation/index.html`,
        )
      : __getWebviewHtml__(webview, context, "roleGen");
  }

  public static async setupWebviewHooks(
    webview: Webview,
    disposables: Disposable[],
  ) {
    function sendErrorMessage(message: string) {
      webview.postMessage({
        type: "errorMessage",
        data: message,
      });
    }

    webview.onDidReceiveMessage(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (message: any) => {
        const type = message.type;
        const data = message.data;
        switch (type) {
          case "generateRole": {
            const generationId = uuidv4();
            const response = await generateRole(
              lightSpeedManager.apiInstance,
              data.text,
              data.outline,
              generationId,
            );
            webview.postMessage({
              type: type,
              data: response,
            });
            return;
          }
          case "getCollectionList": {
            const p = new Promise((resolve) => setTimeout(resolve, 200));
            await p;

            webview.postMessage({
              type: type,
              data: await getCollectionsFromWorkspace(),
            });
            return;
          }
          case "writeRoleInWorkspace": {
            const roleName: string = data.roleName;
            const collectionName: string = data.collectionName;
            const files = data.files.map((i: string[]) => {
              return {
                path: i[0],
                content: i[1],
                file_type: i[2],
              };
            }) as RoleGenerationListEntry[];

            const roleBaseDirUri = await getRoleBaseDir(
              collectionName,
              roleName,
            );

            const savedFilesEntries = [];

            for (const f of files) {
              const dirUri = Uri.joinPath(roleBaseDirUri, `/${f.file_type}s`);
              const fileUri = Uri.joinPath(
                roleBaseDirUri,
                `/${f.file_type}s/main.yml`,
              );
              await workspace.fs.createDirectory(dirUri);
              if (await fileExists(fileUri)) {
                sendErrorMessage(`File already exists (${fileUri})!`);
                webview.postMessage({
                  type: type,
                  data: [],
                });
                return;
              }
              await workspace.fs.writeFile(
                fileUri,
                new TextEncoder().encode(f.content),
              );

              const linkUri = {
                scheme: "file",
                path: fileUri.fsPath,
                authority: "",
              };

              savedFilesEntries.push({
                longPath: `collections/${collectionName.replace(".", "/")}/roles/${roleName}/${f.file_type}s/main.yml`,
                command: `command:vscode.open?${encodeURIComponent(JSON.stringify(linkUri))}`,
              });
            }

            webview.postMessage({
              type: type,
              data: savedFilesEntries,
            });
            return;
          }
        }
      },
      undefined,
      disposables,
    );
  }
}
