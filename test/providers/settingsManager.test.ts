import { expect } from "chai";
import {
  WorkspaceFolderContext,
  WorkspaceManager,
} from "../../src/services/workspaceManager";
import { createTestWorkspaceManager } from "../helper";
import { ExtensionSettings } from "../../src/interfaces/extensionSettings";

function simulateClientSettings(workspaceManager: WorkspaceManager, settings) {
  workspaceManager.clientCapabilities.workspace = {
    configuration: true,
  };
  workspaceManager.connection.workspace.getConfiguration = function () {
    return Promise.resolve(settings);
  };
}

describe("get()", () => {
  describe("Merge settings from client", () => {
    describe("When client provides empty settings", () => {
      let context: WorkspaceFolderContext;
      let mergedSettings: ExtensionSettings;
      before(async () => {
        const workspaceManager = createTestWorkspaceManager();
        simulateClientSettings(workspaceManager, {});
        context = workspaceManager.getContext("");
        mergedSettings = await context.documentSettings.get("");
      });
      it("should return default value for all settings", () => {
        expect(mergedSettings).to.deep.equal(
          context.documentSettings.globalSettings,
        );
      });
    });

    describe("When client provides partial settings", () => {
      let context: WorkspaceFolderContext;
      let mergedSettings: ExtensionSettings;
      before(async () => {
        const workspaceManager = createTestWorkspaceManager();
        simulateClientSettings(workspaceManager, {
          ansibleLint: { enabled: false },
        });
        context = workspaceManager.getContext("");
        mergedSettings = await context.documentSettings.get("");
      });
      it("should return setting from client when defined", () => {
        expect(mergedSettings.ansibleLint.enabled).to.equal(false);
      });
      it("should return default value otherwise", () => {
        expect(mergedSettings.ansibleLint.path).to.equal(
          context.documentSettings.globalSettings.ansibleLint.path,
        );
      });
    });
  });
});
