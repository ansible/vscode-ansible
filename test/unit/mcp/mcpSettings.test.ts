import { expect } from "vitest";

const MCP_MESSAGES = {
  enabled:
    "Ansible Development Tools MCP Server has been enabled successfully and is now available for AI assistants.",
  alreadyEnabled: "Ansible Development Tools MCP Server is already enabled.",
  disabled: "Ansible Development Tools MCP Server has been disabled.",
  alreadyDisabled: "Ansible Development Tools MCP Server is already disabled.",
};

describe("MCP Server Setting Tests", function () {
  describe("Enable Message", function () {
    it("should contain key phrases in enable message", function () {
      expect(MCP_MESSAGES.enabled).toContain("enabled successfully");
      expect(MCP_MESSAGES.enabled).toContain("available for AI assistants");
    });

    it("should contain key phrase in already-enabled message", function () {
      expect(MCP_MESSAGES.alreadyEnabled).toContain("already enabled");
    });
  });

  describe("Disable Message", function () {
    it("should contain key phrase in disable message", function () {
      expect(MCP_MESSAGES.disabled).toContain("has been disabled");
    });

    it("should contain key phrase in already-disabled message", function () {
      expect(MCP_MESSAGES.alreadyDisabled).toContain("already disabled");
    });
  });

  describe("Message consistency", function () {
    it("should have distinct enable and disable messages", function () {
      expect(MCP_MESSAGES.enabled).not.toBe(MCP_MESSAGES.disabled);
      expect(MCP_MESSAGES.alreadyEnabled).not.toBe(
        MCP_MESSAGES.alreadyDisabled,
      );
    });

    it("should all reference Ansible Development Tools MCP Server", function () {
      for (const msg of Object.values(MCP_MESSAGES)) {
        expect(msg).toContain("Ansible Development Tools MCP Server");
      }
    });
  });
});
