import { describe, expect, it } from "vitest";
import {
  Connection,
  DidChangeWatchedFilesParams,
  FileChangeType,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { WorkspaceManager } from "@src/services/workspaceManager.js";

const logged: string[] = [];
const mockConnection = {
  console: {
    log: (message: string) => logged.push(message),
  },
} as unknown as Connection;

function managerWith(...folderUris: string[]): WorkspaceManager {
  const manager = new WorkspaceManager(mockConnection);
  manager.setWorkspaceFolders(
    folderUris.map((uri, index) => ({ uri, name: `folder${index}` })),
  );
  return manager;
}

describe("WorkspaceManager.getWorkspaceFolder", () => {
  it("strips a trailing slash from client workspace folders", () => {
    const manager = managerWith("file:///proj/");

    expect(manager.getWorkspaceFolder("file:///proj/site.yml")?.uri).toBe(
      "file:///proj",
    );
  });

  it("strips repeated trailing slashes", () => {
    const manager = managerWith("file:///proj//");

    expect(manager.getWorkspaceFolder("file:///proj/sub/site.yml")?.uri).toBe(
      "file:///proj",
    );
  });

  it("does not match a sibling folder that shares a name prefix", () => {
    const manager = managerWith("file:///proj");

    expect(manager.getWorkspaceFolder("file:///proj2/site.yml")?.uri).toBe(
      "file:///proj2",
    );
  });

  it("picks the inner-most folder for nested workspace folders", () => {
    const manager = managerWith("file:///proj/", "file:///proj/sub/");

    expect(manager.getWorkspaceFolder("file:///proj/sub/a.yml")?.uri).toBe(
      "file:///proj/sub",
    );
    expect(manager.getWorkspaceFolder("file:///proj/a.yml")?.uri).toBe(
      "file:///proj",
    );
  });

  it("matches documents whose URI uses a different encoding", () => {
    const manager = managerWith("file:///c%3A/proj/");

    expect(manager.getWorkspaceFolder("file:///c:/proj/site.yml")?.uri).toBe(
      "file:///c%3A/proj",
    );
  });

  it("keeps the slash of a filesystem root folder", () => {
    const manager = managerWith("file:///");

    expect(manager.getWorkspaceFolder("file:///site.yml")?.uri).toBe(
      "file:///",
    );
  });

  it("falls back to the document directory without workspace folders", () => {
    const manager = managerWith();
    logged.length = 0;

    expect(manager.getWorkspaceFolder("file:///tmp/play/site.yml")).toEqual({
      uri: "file:///tmp/play",
      name: "play",
    });
    expect(logged).toEqual(["workspace folder explicitly set to /tmp/play"]);
  });
});

describe("WorkspaceManager.getContext", () => {
  it("builds lint diagnostic URIs that match the open document", () => {
    const manager = managerWith("file:///proj/");
    const documentUri = "file:///proj/site.yml";

    const folderUri = manager.getContext(documentUri)?.workspaceFolder.uri;
    expect(folderUri).toBe("file:///proj");
    // Same construction as AnsibleLint.doValidate and processReport.
    const workingDirectory = URI.parse(String(folderUri)).path;
    const diagnosticUri = URI.file(`${workingDirectory}/site.yml`).toString();

    expect(diagnosticUri).toBe(documentUri);
  });
});

describe("WorkspaceFolderContext.handleWatchedDocumentChange", () => {
  function watchedChange(uri: string): DidChangeWatchedFilesParams {
    return { changes: [{ uri, type: FileChangeType.Changed }] };
  }

  it("invalidates cached services only for files inside the folder", () => {
    const context = managerWith("file:///proj").getContext(
      "file:///proj/site.yml",
    );
    expect(context).toBeDefined();
    if (!context) return;
    const cached = Promise.resolve();
    const services = context as unknown as Record<string, unknown>;
    services["_ansibleConfig"] = cached;

    context.handleWatchedDocumentChange(watchedChange("file:///proj2/x.cfg"));
    expect(services["_ansibleConfig"]).toBe(cached);

    context.handleWatchedDocumentChange(watchedChange("file:///proj/x.cfg"));
    expect(services["_ansibleConfig"]).toBeUndefined();
  });
});

describe("WorkspaceManager.handleWorkspaceChanged", () => {
  it("normalizes added folders and removes folders sent with a slash", () => {
    const manager = managerWith("file:///proj");

    manager.handleWorkspaceChanged({
      added: [{ uri: "file:///other/", name: "other" }],
      removed: [{ uri: "file:///proj/", name: "proj" }],
    });

    expect(manager.getWorkspaceFolder("file:///other/a.yml")?.uri).toBe(
      "file:///other",
    );
    expect(manager.getWorkspaceFolder("file:///proj/a.yml")?.uri).toBe(
      "file:///proj",
    );
    expect(logged.at(-1)).toBe("workspace folder explicitly set to /proj");
  });
});
