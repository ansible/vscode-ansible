import * as cp from "child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ANSIBLE_CREATOR_VERSION_MIN } from "@src/definitions/constants";
import { checkContentCreatorRequirements } from "@src/features/contentCreator/utils";
import { withInterpreter } from "@src/features/utils/commandRunner";

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("@src/features/utils/commandRunner", () => ({
  withInterpreter: vi.fn(),
}));

describe("checkContentCreatorRequirements", () => {
  beforeEach(() => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue ?? ""),
    } as unknown as vscode.WorkspaceConfiguration);
    vi.mocked(withInterpreter).mockResolvedValue({
      command: "ansible-creator --version",
      env: {},
    });
    vi.mocked(cp.execSync).mockReturnValue("26.2.0\n");
  });

  it("accepts a creator version at the minimum", async () => {
    await expect(checkContentCreatorRequirements()).resolves.toEqual({
      met: true,
      failures: [],
    });
  });

  it("reports a creator version below the minimum", async () => {
    vi.mocked(cp.execSync).mockReturnValue("26.1.0\n");
    const result = await checkContentCreatorRequirements();
    expect(result.met).toBe(false);
    expect(result.failures).toEqual([
      {
        type: "ansible-creator",
        required: ANSIBLE_CREATOR_VERSION_MIN,
        current: "26.1.0",
      },
    ]);
  });

  it("reports not found when the creator binary fails", async () => {
    vi.mocked(cp.execSync).mockImplementation(() => {
      throw new Error("spawn failed");
    });
    const result = await checkContentCreatorRequirements();
    expect(result.met).toBe(false);
    expect(result.failures[0]?.current).toBe("not found");
  });

  it("reports not found when interpreter resolution throws", async () => {
    vi.mocked(withInterpreter).mockRejectedValue(new Error("no python"));
    const result = await checkContentCreatorRequirements();
    expect(result.met).toBe(false);
    expect(result.failures[0]?.current).toBe("not found");
  });
});
