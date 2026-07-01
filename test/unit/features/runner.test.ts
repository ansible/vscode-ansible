import { describe, it, expect, vi } from "vitest";

vi.mock("@src/utils/executionEnvironment", () => ({
  getContainerEngine: vi.fn(),
}));

vi.mock("@src/definitions/constants", () => ({
  AnsibleCommands: {},
}));

vi.mock("@src/utils/registerCommands", () => ({
  registerCommandWithTelemetry: vi.fn(),
}));

vi.mock("@src/utils/telemetryUtils", () => ({
  TelemetryManager: vi.fn(),
}));

vi.mock("@src/settings", () => ({
  SettingsManager: vi.fn(),
}));

vi.mock("@src/services/TerminalService", () => ({
  TerminalService: { getInstance: vi.fn() },
}));

vi.mock("vscode", () => {
  class Uri {
    scheme: string;
    fsPath: string;
    constructor(scheme: string, fsPath: string) {
      this.scheme = scheme;
      this.fsPath = fsPath;
    }
    static file(p: string) {
      return new Uri("file", p);
    }
  }
  return {
    Uri,
    window: { activeTextEditor: undefined },
    workspace: { getConfiguration: vi.fn(() => ({ path: "ansible" })) },
  };
});

import { extractTargetFsPath } from "@src/features/runner";
import * as vscode from "vscode";

describe("extractTargetFsPath", () => {
  it("should return fsPath of the first file-scheme Uri", () => {
    const uri = vscode.Uri.file("/home/user/playbook.yml");
    expect(extractTargetFsPath(uri)).toBe("/home/user/playbook.yml");
  });

  it("should skip undefined entries", () => {
    const uri = vscode.Uri.file("/home/user/site.yml");
    expect(extractTargetFsPath(undefined, uri)).toBe("/home/user/site.yml");
  });

  it("should skip non-file scheme URIs", () => {
    const untitled = new (vscode.Uri as unknown as new (
      scheme: string,
      fsPath: string,
    ) => vscode.Uri)("untitled", "Untitled-1");
    const fileUri = vscode.Uri.file("/home/user/main.yml");
    expect(extractTargetFsPath(untitled, fileUri)).toBe("/home/user/main.yml");
  });

  it("should return undefined when no file-scheme Uri is found", () => {
    expect(extractTargetFsPath(undefined)).toBeUndefined();
  });
});
