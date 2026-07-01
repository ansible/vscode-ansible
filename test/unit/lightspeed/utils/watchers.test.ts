import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

// Provide createFileSystemWatcher / mutable workspaceFolders on the vscode mock.
vi.mock("vscode", async () => {
  const actual = await vi.importActual<typeof import("vscode")>("vscode");
  return {
    ...actual,
    workspace: {
      ...actual.workspace,
      workspaceFolders: undefined,
      createFileSystemWatcher: vi.fn(),
    },
  };
});

vi.mock("fs");

vi.mock("@src/features/lightspeed/utils/updateRolesContext", () => ({
  updateRoleContext: vi.fn(),
  updateRolesContext: vi.fn(),
}));

vi.mock("@src/features/lightspeed/utils/getRoleNamePathFromFilePath", () => ({
  getRoleNamePathFromFilePath: vi.fn(() => "/computed/role/path"),
}));

import { watchRolesDirectory } from "@src/features/lightspeed/utils/watchers";
import {
  updateRoleContext,
  updateRolesContext,
} from "@src/features/lightspeed/utils/updateRolesContext";
import { getRoleNamePathFromFilePath } from "@src/features/lightspeed/utils/getRoleNamePathFromFilePath";
import { StandardRolePaths } from "@src/definitions/constants";
import type { LightSpeedManager } from "@src/features/lightspeed/base";

type Handlers = {
  change?: (uri: { fsPath: string }) => void;
  delete?: (uri: { fsPath: string }) => void;
  create?: (uri: { fsPath: string }) => void;
};

function makeWatcher(handlers: Handlers) {
  return {
    onDidChange: vi.fn((cb: Handlers["change"]) => {
      handlers.change = cb;
    }),
    onDidDelete: vi.fn((cb: Handlers["delete"]) => {
      handlers.delete = cb;
    }),
    onDidCreate: vi.fn((cb: Handlers["create"]) => {
      handlers.create = cb;
    }),
  };
}

function makeManager(cache: Record<string, unknown> = {}) {
  return {
    ansibleRolesCache: cache,
  } as unknown as LightSpeedManager;
}

const ROLES_PATH = "/project/roles";

describe("watchRolesDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders =
      undefined;
  });

  it("defaults workspaceRoot to 'common' and creates a new watcher", () => {
    const handlers: Handlers = {};
    vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(
      makeWatcher(handlers) as never,
    );
    const manager = makeManager({});

    watchRolesDirectory(manager, ROLES_PATH);

    expect(updateRolesContext).toHaveBeenCalledWith(
      manager.ansibleRolesCache,
      ROLES_PATH,
      "common",
    );
    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith(
      path.join(ROLES_PATH, "**/*"),
    );
  });

  it("returns early without creating a watcher when already watched", () => {
    const manager = makeManager({ common: { [ROLES_PATH]: {} } });

    watchRolesDirectory(manager, ROLES_PATH);

    expect(updateRolesContext).toHaveBeenCalledWith(
      manager.ansibleRolesCache,
      ROLES_PATH,
      "common",
    );
    expect(vscode.workspace.createFileSystemWatcher).not.toHaveBeenCalled();
  });

  describe("onDidChange", () => {
    it("updates the role context when a workspace folder exists", () => {
      const handlers: Handlers = {};
      vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(
        makeWatcher(handlers) as never,
      );
      const manager = makeManager({});
      watchRolesDirectory(manager, ROLES_PATH);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: { fsPath: "/ws" } },
      ];
      handlers.change?.({ fsPath: "/ws/roles/r/tasks/main.yml" });

      expect(getRoleNamePathFromFilePath).toHaveBeenCalledWith(
        "/ws/roles/r/tasks/main.yml",
      );
      expect(updateRoleContext).toHaveBeenCalledWith(
        manager.ansibleRolesCache,
        "/computed/role/path",
        "/ws",
      );
    });

    it("does nothing when there is no workspace folder", () => {
      const handlers: Handlers = {};
      vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(
        makeWatcher(handlers) as never,
      );
      watchRolesDirectory(makeManager({}), ROLES_PATH);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders =
        undefined;
      handlers.change?.({ fsPath: "/ws/roles/r/tasks/main.yml" });

      expect(updateRoleContext).not.toHaveBeenCalled();
    });
  });

  describe("onDidDelete", () => {
    function setupDelete(cache: Record<string, unknown>) {
      const handlers: Handlers = {};
      vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(
        makeWatcher(handlers) as never,
      );
      const manager = makeManager(cache);
      watchRolesDirectory(manager, ROLES_PATH);
      return { handlers, manager };
    }

    it("uses the dirname when the deleted path is a file", () => {
      const dir = "/ws/roles/myrole";
      const cache = { "/ws": { [dir]: {} } } as Record<string, unknown>;
      const { handlers } = setupDelete(cache);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
      } as never);
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: { fsPath: "/ws" } },
      ];

      handlers.delete?.({ fsPath: `${dir}/main.yml` });

      expect(fs.statSync).toHaveBeenCalledWith(`${dir}/main.yml`);
      expect((cache["/ws"] as Record<string, unknown>)[dir]).toBeUndefined();
    });

    it("removes a standard role path from the common cache", () => {
      const standard = StandardRolePaths[1];
      const cache = { common: { [standard]: {} } } as Record<string, unknown>;
      const { handlers } = setupDelete(cache);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => false,
      } as never);

      handlers.delete?.({ fsPath: standard });

      expect(
        (cache.common as Record<string, unknown>)[standard],
      ).toBeUndefined();
    });

    it("removes a workspace dir from the workspace cache", () => {
      const dir = "/ws/roles/other";
      const cache = { "/ws": { [dir]: {} } } as Record<string, unknown>;
      const { handlers } = setupDelete(cache);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => false,
      } as never);
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: { fsPath: "/ws" } },
      ];

      handlers.delete?.({ fsPath: dir });

      expect((cache["/ws"] as Record<string, unknown>)[dir]).toBeUndefined();
    });

    it("does nothing when the dir is not in the workspace cache", () => {
      const cache = { "/ws": {} } as Record<string, unknown>;
      const { handlers } = setupDelete(cache);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => false,
      } as never);
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: { fsPath: "/ws" } },
      ];

      expect(() =>
        handlers.delete?.({ fsPath: "/ws/roles/missing" }),
      ).not.toThrow();
    });

    it("does not throw when the workspace has no cache bucket", () => {
      // workspaceFolders present, but ansibleRolesCache has no entry for it.
      const cache = {} as Record<string, unknown>;
      const { handlers } = setupDelete(cache);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => false,
      } as never);
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: { fsPath: "/ws" } },
      ];

      expect(() =>
        handlers.delete?.({ fsPath: "/ws/roles/missing" }),
      ).not.toThrow();
    });

    it("does not throw when there are no workspace folders", () => {
      const cache = {} as Record<string, unknown>;
      const { handlers } = setupDelete(cache);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => false,
      } as never);
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders =
        undefined;

      expect(() =>
        handlers.delete?.({ fsPath: "/somewhere/roles/x" }),
      ).not.toThrow();
    });
  });

  describe("onDidCreate", () => {
    it("updates the role context when a workspace folder exists", () => {
      const handlers: Handlers = {};
      vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(
        makeWatcher(handlers) as never,
      );
      const manager = makeManager({});
      watchRolesDirectory(manager, ROLES_PATH);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: { fsPath: "/ws" } },
      ];
      handlers.create?.({ fsPath: "/ws/roles/r/tasks/main.yml" });

      expect(updateRoleContext).toHaveBeenCalledWith(
        manager.ansibleRolesCache,
        "/computed/role/path",
        "/ws",
      );
    });

    it("does nothing when there is no workspace folder", () => {
      const handlers: Handlers = {};
      vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(
        makeWatcher(handlers) as never,
      );
      watchRolesDirectory(makeManager({}), ROLES_PATH);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders =
        undefined;
      handlers.create?.({ fsPath: "/ws/roles/r/tasks/main.yml" });

      expect(updateRoleContext).not.toHaveBeenCalled();
    });
  });
});
