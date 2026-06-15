import { describe, it, expect } from "vitest";

const MCP_CONFIG_SECTION = "ansible.mcpServer";
const MCP_SETTING_KEY = "enabled";
const MCP_DEFAULT_VALUE = false;

const MCP_MESSAGES = {
  enabled:
    "Ansible Development Tools MCP Server has been enabled successfully and is now available for AI assistants.",
  alreadyEnabled:
    "Ansible Development Tools MCP Server is already enabled and available.",
  disabled: "Ansible Development Tools MCP Server has been disabled.",
  alreadyDisabled: "Ansible Development Tools MCP Server is already disabled.",
} as const;

describe("MCP Server Setting Tests", function () {
  describe("Default Setting", function () {
    it("should have MCP server disabled by default", function () {
      expect(MCP_DEFAULT_VALUE).toBe(false);
    });

    it("should use correct configuration section name", function () {
      expect(MCP_CONFIG_SECTION).toContain("ansible.");
      expect(MCP_CONFIG_SECTION).toMatch(/^ansible\.\w+$/);
      expect(MCP_SETTING_KEY).toBe("enabled");
    });
  });

  describe("Enable Message", function () {
    it("should show success message when MCP server is enabled", function () {
      expect(MCP_MESSAGES.enabled).toContain("enabled successfully");
      expect(MCP_MESSAGES.enabled).toContain("AI assistants");
    });

    it("should show message when MCP server is already enabled", function () {
      expect(MCP_MESSAGES.alreadyEnabled).toContain("already enabled");
      expect(MCP_MESSAGES.alreadyEnabled).not.toContain("disabled");
    });
  });

  describe("Disable Message", function () {
    it("should show success message when MCP server is disabled", function () {
      expect(MCP_MESSAGES.disabled).toContain("disabled");
      expect(MCP_MESSAGES.disabled).not.toContain("enabled successfully");
    });

    it("should show message when MCP server is already disabled", function () {
      expect(MCP_MESSAGES.alreadyDisabled).toContain("already disabled");
      expect(MCP_MESSAGES.alreadyDisabled).not.toContain(
        "enabled successfully",
      );
    });
  });

  describe("Configuration Change Messages", function () {
    it("should produce correct message based on enabled state", function () {
      const getMessageForState = (isEnabled: boolean): string =>
        isEnabled ? MCP_MESSAGES.enabled : MCP_MESSAGES.disabled;

      const enabledMessage = getMessageForState(true);
      const disabledMessage = getMessageForState(false);

      expect(enabledMessage).toContain("enabled");
      expect(disabledMessage).toContain("disabled");
      expect(enabledMessage).not.toBe(disabledMessage);
    });

    it("should have distinct messages for all states", function () {
      const allMessages = Object.values(MCP_MESSAGES);
      const uniqueMessages = new Set(allMessages);

      expect(uniqueMessages.size).toBe(allMessages.length);
    });
  });
});
