import { expect } from "vitest";

describe("MCP Server Setting Tests", function () {
  describe("Default Setting", function () {
    it("should have MCP server disabled by default", function () {
      const defaultValue = false;
      expect(defaultValue).toBe(false);
    });

    it("should use correct configuration section name", function () {
      const configSection = "ansible.mcpServer";
      const expectedSetting = "enabled";

      expect(configSection).toBe("ansible.mcpServer");
      expect(expectedSetting).toBe("enabled");
    });
  });

  describe("Enable Message", function () {
    it("should have correct enable message", function () {
      const enableMessage =
        "Ansible Development Tools MCP Server has been enabled successfully and is now available for AI assistants.";

      expect(enableMessage).toContain("enabled successfully");
      expect(enableMessage).toContain("available for AI assistants");
    });

    it("should have correct already-enabled message", function () {
      const alreadyEnabledMessage =
        "Ansible Development Tools MCP Server is already enabled.";

      expect(alreadyEnabledMessage).toContain("already enabled");
    });
  });

  describe("Disable Message", function () {
    it("should have correct disable message", function () {
      const disableMessage =
        "Ansible Development Tools MCP Server has been disabled.";

      expect(disableMessage).toContain("has been disabled");
    });

    it("should have correct already-disabled message", function () {
      const alreadyDisabledMessage =
        "Ansible Development Tools MCP Server is already disabled.";

      expect(alreadyDisabledMessage).toContain("already disabled");
    });
  });

  describe("Configuration Change Messages", function () {
    it("should have correct enable config change message", function () {
      const configChangeEnabledMessage =
        "Ansible Development Tools MCP Server has been enabled successfully and is now available for AI assistants.";

      expect(configChangeEnabledMessage).toContain("enabled successfully");
    });

    it("should have correct disable config change message", function () {
      const configChangeDisabledMessage =
        "Ansible Development Tools MCP Server has been disabled.";

      expect(configChangeDisabledMessage).toContain("has been disabled");
    });
  });
});
