import { expect, beforeAll } from "vitest";
import {
  WorkspaceFolderContext,
  WorkspaceManager,
} from "../../src/services/workspaceManager";
import { createTestWorkspaceManager } from "../helper";
import { ExtensionSettings } from "../../src/interfaces/extensionSettings";
import { ConfigurationItem } from "vscode-languageclient";

function simulateClientSettings(
  workspaceManager: WorkspaceManager,
  settings: ConfigurationItem[] | ConfigurationItem | object,
) {
  workspaceManager.clientCapabilities.workspace = {
    configuration: true,
  };
  workspaceManager.connection.workspace.getConfiguration = function () {
    return Promise.resolve(settings as unknown[]);
  };
}

describe("get()", function () {
  describe("Merge settings from client", function () {
    describe("When client provides empty settings", function () {
      let context: WorkspaceFolderContext | undefined;
      let mergedSettings: ExtensionSettings;

      beforeAll(async () => {
        const workspaceManager = createTestWorkspaceManager();
        simulateClientSettings(workspaceManager, []);
        context = workspaceManager.getContext("");
        if (typeof context !== "undefined") {
          mergedSettings = await context.documentSettings.get("");
        }
      });

      it("should return default value for all settings", function () {
        expect(typeof context !== "undefined");
        if (typeof context !== "undefined") {
          expect(mergedSettings).toEqual(
            context.documentSettings.globalSettings,
          );
        }
      });
    });

    describe("When client provides partial settings", function () {
      let context: WorkspaceFolderContext | undefined;
      let mergedSettings: ExtensionSettings;

      beforeAll(async () => {
        const workspaceManager = createTestWorkspaceManager();
        simulateClientSettings(workspaceManager, {
          validation: { lint: { enabled: false } },
        });
        context = workspaceManager.getContext("");
        if (typeof context !== "undefined") {
          mergedSettings = await context.documentSettings.get("");
        }
      });

      it("should return setting from client when defined", function () {
        expect(mergedSettings.validation.lint.enabled).toBe(false);
      });

      it("should return default value otherwise", function () {
        if (typeof context !== "undefined") {
          expect(mergedSettings.validation.lint.path).toBe(
            context.documentSettings.globalSettings.validation.lint.path,
          );
        }
      });
    });
  });

  describe("When client provides autoFixOnSave setting", function () {
    let mergedSettings: ExtensionSettings;

    beforeAll(async () => {
      const workspaceManager = createTestWorkspaceManager();
      simulateClientSettings(workspaceManager, {
        validation: { lint: { autoFixOnSave: true } },
      });
      const context = workspaceManager.getContext("");
      if (typeof context !== "undefined") {
        mergedSettings = await context.documentSettings.get("");
      }
    });

    it("should return autoFixOnSave value from client", function () {
      expect(mergedSettings.validation.lint.autoFixOnSave).toBe(true);
    });
  });
});
