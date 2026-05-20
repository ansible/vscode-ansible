import { describe, it, expect, vi } from "vitest";
import { DiagnosticSeverity } from "vscode-languageserver";
import { AnsibleApme } from "@src/services/ansibleApme.js";

// Access the private parseApmeOutput via prototype for testing
const parseApmeOutput = (AnsibleApme.prototype as any)["parseApmeOutput"].bind({
  connection: { console: { error: () => {}, log: () => {}, warn: () => {} } },
});

describe("AnsibleApme.parseApmeOutput", () => {
  const workDir = "/workspace/project";

  it("should parse violations with correct fields", () => {
    const json = JSON.stringify({
      violations: [
        {
          rule_id: "L003",
          severity: "low",
          message: "Deprecated module found",
          file: "site.yml",
          line: 5,
          remediation_class: "manual-review",
        },
      ],
      count: 1,
    });

    const result = parseApmeOutput(json, workDir);
    const diags = result.get("file:///workspace/project/site.yml");

    expect(diags).toBeDefined();
    expect(diags!.length).toBe(1);
    expect(diags![0].message).toContain("L003");
    expect(diags![0].message).toContain("Deprecated module found");
    expect(diags![0].source).toBe("Ansible [apme]");
    expect(diags![0].code).toBe("L003");
    expect(diags![0].range.start.line).toBe(4); // 0-indexed
    expect(diags![0].severity).toBe(DiagnosticSeverity.Information);
  });

  it("should map severity correctly", () => {
    const json = JSON.stringify({
      violations: [
        {
          rule_id: "R108",
          severity: "high",
          message: "Risky permission",
          file: "play.yml",
          line: 1,
          remediation_class: "ai-candidate",
        },
        {
          rule_id: "M010",
          severity: "medium",
          message: "Migration needed",
          file: "play.yml",
          line: 2,
          remediation_class: "auto-fixable",
        },
        {
          rule_id: "L067",
          severity: "info",
          message: "Set verbosity",
          file: "play.yml",
          line: 3,
          remediation_class: "manual-review",
        },
      ],
      count: 3,
    });

    const result = parseApmeOutput(json, workDir);
    const diags = result.get("file:///workspace/project/play.yml")!;

    expect(diags[0].severity).toBe(DiagnosticSeverity.Error);
    expect(diags[1].severity).toBe(DiagnosticSeverity.Warning);
    expect(diags[2].severity).toBe(DiagnosticSeverity.Information);
  });

  it("should classify tiers from remediation_class", () => {
    const json = JSON.stringify({
      violations: [
        {
          rule_id: "M009",
          severity: "low",
          message: "Auto-fixable issue",
          file: "a.yml",
          line: 1,
          remediation_class: "auto-fixable",
        },
        {
          rule_id: "L026",
          severity: "low",
          message: "AI candidate issue",
          file: "a.yml",
          line: 2,
          remediation_class: "ai-candidate",
        },
        {
          rule_id: "R401",
          severity: "info",
          message: "Manual review issue",
          file: "a.yml",
          line: 3,
          remediation_class: "manual-review",
        },
      ],
      count: 3,
    });

    const result = parseApmeOutput(json, workDir);
    const diags = result.get("file:///workspace/project/a.yml")!;

    expect(diags[0].data.tier).toBe(1);
    expect(diags[0].data.fixable).toBe(true);
    expect(diags[0].data.ai_proposable).toBe(false);
    expect(diags[0].message).toContain("[auto-fixable]");

    expect(diags[1].data.tier).toBe(2);
    expect(diags[1].data.fixable).toBe(false);
    expect(diags[1].data.ai_proposable).toBe(true);
    expect(diags[1].message).toContain("[ai-candidate]");

    expect(diags[2].data.tier).toBe(3);
    expect(diags[2].data.fixable).toBe(false);
    expect(diags[2].data.ai_proposable).toBe(false);
    expect(diags[2].message).not.toContain("[auto-fixable]");
    expect(diags[2].message).not.toContain("[ai-candidate]");
  });

  it("should handle empty violations array", () => {
    const json = JSON.stringify({
      violations: [],
      count: 0,
    });

    const result = parseApmeOutput(json, workDir);
    expect(result.size).toBe(0);
  });

  it("should handle empty string input", () => {
    const result = parseApmeOutput("", workDir);
    expect(result.size).toBe(0);
  });

  it("should handle malformed JSON gracefully", () => {
    const result = parseApmeOutput("not valid json {{{", workDir);
    expect(result.size).toBe(0);
  });

  it("should handle violations with absolute file paths", () => {
    const json = JSON.stringify({
      violations: [
        {
          rule_id: "L005",
          severity: "low",
          message: "Community module",
          file: "/absolute/path/to/play.yml",
          line: 10,
          remediation_class: "ai-candidate",
        },
      ],
      count: 1,
    });

    const result = parseApmeOutput(json, workDir);
    const diags = result.get("file:///absolute/path/to/play.yml");
    expect(diags).toBeDefined();
    expect(diags!.length).toBe(1);
  });

  it("should handle violations with relative file paths", () => {
    const json = JSON.stringify({
      violations: [
        {
          rule_id: "L024",
          severity: "low",
          message: "Some issue",
          file: "roles/myrole/tasks/main.yml",
          line: 4,
          remediation_class: "ai-candidate",
        },
      ],
      count: 1,
    });

    const result = parseApmeOutput(json, workDir);
    const diags = result.get(
      "file:///workspace/project/roles/myrole/tasks/main.yml",
    );
    expect(diags).toBeDefined();
    expect(diags!.length).toBe(1);
  });

  it("should distribute violations across multiple files", () => {
    const json = JSON.stringify({
      violations: [
        {
          rule_id: "L003",
          severity: "low",
          message: "Issue in file A",
          file: "a.yml",
          line: 1,
          remediation_class: "manual-review",
        },
        {
          rule_id: "L005",
          severity: "low",
          message: "Issue in file B",
          file: "b.yml",
          line: 2,
          remediation_class: "ai-candidate",
        },
        {
          rule_id: "L024",
          severity: "low",
          message: "Another issue in file A",
          file: "a.yml",
          line: 5,
          remediation_class: "ai-candidate",
        },
      ],
      count: 3,
    });

    const result = parseApmeOutput(json, workDir);
    expect(result.size).toBe(2);
    expect(result.get("file:///workspace/project/a.yml")!.length).toBe(2);
    expect(result.get("file:///workspace/project/b.yml")!.length).toBe(1);
  });

  it("should skip violations missing rule_id", () => {
    const json = JSON.stringify({
      violations: [
        {
          severity: "low",
          message: "No rule ID",
          file: "a.yml",
          line: 1,
        },
      ],
      count: 1,
    });

    const result = parseApmeOutput(json, workDir);
    expect(result.size).toBe(0);
  });

  it("should skip violations missing file", () => {
    const json = JSON.stringify({
      violations: [
        {
          rule_id: "L003",
          severity: "low",
          message: "No file",
          line: 1,
        },
      ],
      count: 1,
    });

    const result = parseApmeOutput(json, workDir);
    expect(result.size).toBe(0);
  });

  it("should handle line 0 (role/project-level violations)", () => {
    const json = JSON.stringify({
      violations: [
        {
          rule_id: "L027",
          severity: "low",
          message: "Role-level issue",
          file: "roles/broken_role",
          line: 0,
          remediation_class: "ai-candidate",
        },
      ],
      count: 1,
    });

    const result = parseApmeOutput(json, workDir);
    const diags = result.get("file:///workspace/project/roles/broken_role")!;
    expect(diags[0].range.start.line).toBe(0);
  });

  it("should include codeDescription href for rule docs", () => {
    const json = JSON.stringify({
      violations: [
        {
          rule_id: "L003",
          severity: "low",
          message: "Test",
          file: "a.yml",
          line: 1,
          remediation_class: "manual-review",
        },
      ],
      count: 1,
    });

    const result = parseApmeOutput(json, workDir);
    const diag = result.get("file:///workspace/project/a.yml")![0];
    expect(diag.codeDescription).toBeDefined();
    expect(diag.codeDescription!.href).toContain("l003");
  });

  it("should default missing remediation_class to manual-review (tier 3)", () => {
    const json = JSON.stringify({
      violations: [
        {
          rule_id: "L099",
          severity: "low",
          message: "No remediation class",
          file: "a.yml",
          line: 1,
        },
      ],
      count: 1,
    });

    const result = parseApmeOutput(json, workDir);
    const diag = result.get("file:///workspace/project/a.yml")![0];
    expect(diag.data.tier).toBe(3);
    expect(diag.data.fixable).toBe(false);
    expect(diag.data.ai_proposable).toBe(false);
  });
});

describe("AnsibleApme.doValidate", () => {
  function createMockContext(
    overrides: {
      validationEnabled?: boolean;
      apmeEnabled?: boolean;
      autoFixOnSave?: boolean;
      apmePath?: string;
    } = {},
  ) {
    const {
      validationEnabled = true,
      apmeEnabled = true,
      autoFixOnSave = false,
      apmePath = "apme",
    } = overrides;

    return {
      documentSettings: {
        get: () =>
          Promise.resolve({
            validation: {
              enabled: validationEnabled,
              apme: {
                enabled: apmeEnabled,
                path: apmePath,
                arguments: "",
                autoFixOnSave,
              },
            },
            executionEnvironment: { enabled: false },
          }),
      },
      workspaceFolder: { uri: "file:///workspace/project" },
      clientCapabilities: { window: {} },
    };
  }

  const mockConnection = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
    },
    window: {
      createWorkDoneProgress: () =>
        Promise.resolve({ begin: () => {}, done: () => {} }),
    },
  };

  it("should return empty map when validation is disabled", async () => {
    const ctx = createMockContext({ validationEnabled: false });
    const apme = new AnsibleApme(mockConnection as any, ctx as any);
    const doc = { uri: "file:///workspace/project/test.yml" } as any;
    const result = await apme.doValidate(doc);
    expect(result.size).toBe(0);
  });

  it("should return empty map when apme is disabled", async () => {
    const ctx = createMockContext({ apmeEnabled: false });
    const apme = new AnsibleApme(mockConnection as any, ctx as any);
    const doc = { uri: "file:///workspace/project/test.yml" } as any;
    const result = await apme.doValidate(doc);
    expect(result.size).toBe(0);
  });
});

describe("AnsibleApme.doRemediate concurrency guard", () => {
  const mockConnection = {
    console: {
      log: () => {},
      warn: vi.fn(),
      error: () => {},
    },
  };

  const mockContext = {
    documentSettings: {
      get: () =>
        Promise.resolve({
          validation: {
            enabled: true,
            apme: { enabled: true, path: "apme", arguments: "" },
          },
          executionEnvironment: { enabled: false },
          python: { interpreterPath: "python3", activationScript: "" },
        }),
    },
    workspaceFolder: { uri: "file:///workspace/project" },
    clientCapabilities: { window: {} },
  };

  it("should reject second concurrent call for same path", async () => {
    const apme = new AnsibleApme(mockConnection as any, mockContext as any);

    // Access remediationInFlight to simulate in-flight state
    (apme as any).remediationInFlight.add("/workspace/project/test.yml");

    const result = await apme.doRemediate("/workspace/project/test.yml");
    expect(result.success).toBe(false);
    expect(result.filesUpdated).toBe(0);
    expect(mockConnection.console.warn).toHaveBeenCalled();
  });
});

describe("AnsibleApme.mergeDiagnostics via validationProvider", () => {
  it("should be importable from validationProvider", async () => {
    const mod = await import("@src/providers/validationProvider.js");
    expect(mod.doValidate).toBeDefined();
    expect(mod.getYamlValidation).toBeDefined();
    expect(mod.mergeDiagnostics).toBeDefined();
  });
});
