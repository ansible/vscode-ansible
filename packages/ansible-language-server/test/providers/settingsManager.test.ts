import { expect, beforeAll } from "vitest";
import {
  WorkspaceFolderContext,
  WorkspaceManager,
} from "@src/services/workspaceManager.js";
import { createTestWorkspaceManager } from "@test/helper.js";
import type { ExtensionSettings } from "@src/interfaces/extensionSettings.js";
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
        expect(context).toBeDefined();
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

describe("handleConfigurationChanged()", function () {
  describe("When the client pushes partial legacy settings", function () {
    let settings: ExtensionSettings;
    let defaults: ExtensionSettings;

    beforeAll(async () => {
      const workspaceManager = createTestWorkspaceManager();
      const context = workspaceManager.getContext("");
      if (typeof context === "undefined") {
        throw new Error("No workspace context");
      }
      defaults = structuredClone(context.documentSettings.globalSettings);
      await context.documentSettings.handleConfigurationChanged({
        settings: { ansible: { validation: { enabled: false } } },
      });
      settings = await context.documentSettings.get("");
    });

    it("should apply the provided setting", function () {
      expect(settings.validation.enabled).toBe(false);
    });

    it("should keep defaults for omitted settings", function () {
      expect(settings.completion).toEqual(defaults.completion);
      expect(settings.validation.lint).toEqual(defaults.validation.lint);
    });

    it("should default array settings to arrays", function () {
      expect(settings.executionEnvironment.volumeMounts).toEqual([]);
    });
  });

  describe("When the client pushes no ansible settings", function () {
    it("should fall back to defaults", async function () {
      const workspaceManager = createTestWorkspaceManager();
      const context = workspaceManager.getContext("");
      if (typeof context === "undefined") {
        throw new Error("No workspace context");
      }
      const defaults = structuredClone(context.documentSettings.globalSettings);
      await context.documentSettings.handleConfigurationChanged({
        settings: {},
      });
      expect(await context.documentSettings.get("")).toEqual(defaults);
    });
  });
});
