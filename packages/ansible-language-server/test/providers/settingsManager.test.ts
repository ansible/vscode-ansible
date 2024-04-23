import { expect } from "chai";
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

describe("get()", () => {
  describe("Merge settings from client", () => {
    describe("When client provides empty settings", () => {
      let context: WorkspaceFolderContext | undefined;
      let mergedSettings: ExtensionSettings;
      before(async () => {
        const workspaceManager = createTestWorkspaceManager();
        simulateClientSettings(workspaceManager, []);
        context = workspaceManager.getContext("");
        if (typeof context !== "undefined") {
          mergedSettings = await context.documentSettings.get("");
        }
      });
      it("should return default value for all settings", () => {
        expect(typeof context !== "undefined");
        if (typeof context !== "undefined") {
          expect(mergedSettings).to.deep.equal(
            context.documentSettings.globalSettings,
          );
        }
      });
    });

    describe("When client provides partial settings", () => {
      let context: WorkspaceFolderContext | undefined;
      let mergedSettings: ExtensionSettings;
      before(async () => {
        const workspaceManager = createTestWorkspaceManager();
        simulateClientSettings(workspaceManager, {
          validation: { lint: { enabled: false } },
        });
        context = workspaceManager.getContext("");
        if (typeof context !== "undefined") {
          mergedSettings = await context.documentSettings.get("");
        }
      });
      it("should return setting from client when defined", () => {
        expect(mergedSettings.validation.lint.enabled).to.equal(false);
      });
      it("should return default value otherwise", () => {
        if (typeof context !== "undefined") {
          expect(mergedSettings.validation.lint.path).to.equal(
            context.documentSettings.globalSettings.validation.lint.path,
          );
        }
      });
    });
  });
});
