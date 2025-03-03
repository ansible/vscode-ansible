// @vitest-environment node

import * as vscode from "vscode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { URI } from "vscode-uri";
import { showPlaybookGenerationPage } from "../../../../src/features/lightspeed/playbookGeneration";
import { lightSpeedManager } from "../../../../src/extension";

vi.mock("../../../../src/extension", () => {
  return {
    lightSpeedManager: {
      lightspeedAuthenticatedUser: {
        isAuthenticated: vi.fn(() => Promise.resolve(true)),
      },
      apiInstance: {
        feedbackRequest: () => Promise.resolve(true),
      },
    },
  };
});

vi.mock("vscode");

afterEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});

describe("playbookGeneration", () => {
  describe("showPlaybookGenerationPage", () => {
    it("should show error message when user is not logged in", async () => {
      vi.mocked(
        lightSpeedManager.lightspeedAuthenticatedUser.isAuthenticated,
      ).mockResolvedValue(false);
      await showPlaybookGenerationPage(
        URI.parse("http://www.ansible.com/some/path"),
      );

      expect(vscode.window.showErrorMessage).toBeCalledTimes(1);
      expect(vscode.window.showErrorMessage).toBeCalledWith(
        "Log in to Ansible Lightspeed to use this feature.",
      );
    });
    it("should not show error message when user is logged in", async () => {
      await showPlaybookGenerationPage(
        URI.parse("http://www.ansible.com/some/path"),
      );

      expect(vscode.window.showErrorMessage).toBeCalledTimes(0);
    });
  });
});
