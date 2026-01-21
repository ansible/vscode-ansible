import { describe, it, expect } from "vitest";
import { generateStatusBarTooltipMarkdown } from "../../../src/features/lightspeed/statusBar";
import { LIGHTSPEED_MODEL_DEFAULT } from "../../../src/definitions/lightspeed";

describe("generateStatusBarTooltipMarkdown", () => {
  describe("user details section", () => {
    it("should include user type when provided", () => {
      const result = generateStatusBarTooltipMarkdown({
        userInfo: { userType: "Licensed" },
        provider: "wca",
        modelName: undefined,
      });

      expect(result).toContain("User Details:");
      expect(result).toContain("- User Type: Licensed");
    });

    it("should include role when provided", () => {
      const result = generateStatusBarTooltipMarkdown({
        userInfo: { role: "Administrator" },
        provider: "wca",
        modelName: undefined,
      });

      expect(result).toContain("User Details:");
      expect(result).toContain("- Role: Administrator");
    });

    it("should include both user type and role when both provided", () => {
      const result = generateStatusBarTooltipMarkdown({
        userInfo: { userType: "Licensed", role: "Administrator" },
        provider: "wca",
        modelName: undefined,
      });

      expect(result).toContain("User Details:");
      expect(result).toContain("- User Type: Licensed");
      expect(result).toContain("- Role: Administrator");
    });

    it("should not include user details section when userInfo is undefined", () => {
      const result = generateStatusBarTooltipMarkdown({
        userInfo: undefined,
        provider: "wca",
        modelName: undefined,
      });

      expect(result).not.toContain("User Details:");
      expect(result).not.toContain("- User Type:");
      expect(result).not.toContain("- Role:");
    });

    it("should not include user details section when userInfo has no userType or role", () => {
      const result = generateStatusBarTooltipMarkdown({
        userInfo: {},
        provider: "wca",
        modelName: undefined,
      });

      expect(result).not.toContain("User Details:");
    });
  });

  describe("model details section", () => {
    it("should show default model for wca provider", () => {
      const result = generateStatusBarTooltipMarkdown({
        userInfo: undefined,
        provider: "wca",
        modelName: "some-model",
      });

      expect(result).toContain("Model Details:");
      expect(result).toContain(`- Model: ${LIGHTSPEED_MODEL_DEFAULT}`);
    });

    it("should show custom model for non-wca provider when modelName is provided", () => {
      const result = generateStatusBarTooltipMarkdown({
        userInfo: undefined,
        provider: "google",
        modelName: "gemini-2.5-flash",
      });

      expect(result).toContain("Model Details:");
      expect(result).toContain("- Model: gemini-2.5-flash");
    });

    it("should show default model for non-wca provider when modelName is not provided", () => {
      const result = generateStatusBarTooltipMarkdown({
        userInfo: undefined,
        provider: "google",
        modelName: undefined,
      });

      expect(result).toContain("Model Details:");
      expect(result).toContain(`- Model: ${LIGHTSPEED_MODEL_DEFAULT}`);
    });

    it("should show default model for non-wca provider when modelName is empty", () => {
      const result = generateStatusBarTooltipMarkdown({
        userInfo: undefined,
        provider: "ollama",
        modelName: "",
      });

      expect(result).toContain("Model Details:");
      expect(result).toContain(`- Model: ${LIGHTSPEED_MODEL_DEFAULT}`);
    });

    it("should show default model when provider is undefined", () => {
      const result = generateStatusBarTooltipMarkdown({
        userInfo: undefined,
        provider: undefined,
        modelName: "some-model",
      });

      expect(result).toContain("Model Details:");
      expect(result).toContain("- Model: some-model");
    });
  });

  describe("complete tooltip", () => {
    it("should generate complete tooltip with all information", () => {
      const result = generateStatusBarTooltipMarkdown({
        userInfo: { userType: "Licensed", role: "Administrator" },
        provider: "google",
        modelName: "gemini-2.5-pro",
      });

      expect(result).toContain("User Details:");
      expect(result).toContain("- User Type: Licensed");
      expect(result).toContain("- Role: Administrator");
      expect(result).toContain("Model Details:");
      expect(result).toContain("- Model: gemini-2.5-pro");
    });

    it("should generate tooltip with only model details when no user info", () => {
      const result = generateStatusBarTooltipMarkdown({
        userInfo: undefined,
        provider: "ollama",
        modelName: "llama2",
      });

      expect(result).not.toContain("User Details:");
      expect(result).toContain("Model Details:");
      expect(result).toContain("- Model: llama2");
    });
  });
});
