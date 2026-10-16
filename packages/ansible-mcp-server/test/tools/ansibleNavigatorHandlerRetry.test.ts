import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAnsibleNavigatorHandler } from "@src/handlers.js";
import {
  runAnsibleNavigator,
  formatNavigatorResult,
} from "@src/tools/ansibleNavigator.js";

vi.mock("@src/tools/ansibleNavigator.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@src/tools/ansibleNavigator.js")>();
  return {
    ...actual,
    runAnsibleNavigator: vi.fn(),
    formatNavigatorResult: vi.fn(),
  };
});

describe("Ansible Navigator handler container retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries with execution environment disabled after container engine errors", async () => {
    vi.mocked(runAnsibleNavigator)
      .mockRejectedValueOnce(new Error("container engine not available"))
      .mockResolvedValueOnce({
        output: "PLAY RECAP",
        debugOutput: "",
        navigatorPath: "/usr/bin/ansible-navigator",
        executionEnvironmentDisabled: true,
      });
    vi.mocked(formatNavigatorResult).mockReturnValue("formatted output");

    const handler = createAnsibleNavigatorHandler();
    const result = await handler({
      filePath: "/workspace/play.yml",
      userMessage: "run play.yml",
    });

    expect(runAnsibleNavigator).toHaveBeenCalledTimes(2);
    expect(runAnsibleNavigator).toHaveBeenNthCalledWith(
      1,
      "/workspace/play.yml",
      "stdout",
      undefined,
      false,
      "auto",
    );
    expect(runAnsibleNavigator).toHaveBeenNthCalledWith(
      2,
      "/workspace/play.yml",
      "stdout",
      undefined,
      true,
      "auto",
    );
    expect(result.content[0]?.text).toContain("Automatically retrying");
    expect(result.isError).toBeUndefined();
  });
});
