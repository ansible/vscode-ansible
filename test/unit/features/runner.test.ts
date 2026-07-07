import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "fs";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("vscode", () => ({
  workspace: { getConfiguration: vi.fn() },
  window: {
    activeTextEditor: undefined,
    showErrorMessage: vi.fn(),
    createTerminal: vi.fn(),
  },
  commands: { registerCommand: vi.fn() },
  Uri: { file: (p: string) => ({ fsPath: p, scheme: "file" }) },
  EventEmitter: vi.fn(),
}));

import { shellQuote } from "@src/features/runner";

describe("shellQuote", () => {
  it("wraps a simple string in single quotes", () => {
    expect(shellQuote("hello")).toBe("'hello'");
  });

  it("wraps a path with spaces", () => {
    expect(shellQuote("/path/to/my playbook.yml")).toBe(
      "'/path/to/my playbook.yml'",
    );
  });

  it("escapes embedded single quotes", () => {
    expect(shellQuote("it's a test")).toBe("'it'\\''s a test'");
  });

  it("neutralizes dollar-sign command substitution", () => {
    expect(shellQuote("play$(whoami).yml")).toBe("'play$(whoami).yml'");
  });

  it("neutralizes backtick command substitution", () => {
    expect(shellQuote("play`id`.yml")).toBe("'play`id`.yml'");
  });

  it("neutralizes semicolons", () => {
    expect(shellQuote("play;rm -rf /.yml")).toBe("'play;rm -rf /.yml'");
  });

  it("neutralizes pipes", () => {
    expect(shellQuote("play|cat /etc/passwd.yml")).toBe(
      "'play|cat /etc/passwd.yml'",
    );
  });

  it("handles empty string", () => {
    expect(shellQuote("")).toBe("''");
  });

  it("handles paths with multiple spaces", () => {
    expect(shellQuote("/a b/c d/e f.yml")).toBe("'/a b/c d/e f.yml'");
  });
});

describe("validatePlaybookPath (via integration)", () => {
  const mockedExistsSync = vi.mocked(existsSync);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects paths with shell metacharacters", async () => {
    const dangerousPaths = [
      "/tmp/play$(whoami).yml",
      "/tmp/play`id`.yml",
      "/tmp/play;rm -rf /.yml",
      "/tmp/play|cat.yml",
      "/tmp/play&bg.yml",
      "/tmp/play(sub).yml",
      "/tmp/play<in.yml",
      "/tmp/play>out.yml",
      "/tmp/play!bad.yml",
    ];

    for (const p of dangerousPaths) {
      mockedExistsSync.mockReturnValue(true);

      const { SHELL_METACHARACTERS_PATTERN } =
        await import("@src/features/runner");
      expect(
        SHELL_METACHARACTERS_PATTERN.test(p),
        `Expected rejection for: ${p}`,
      ).toBe(true);
    }
  });

  it("accepts safe paths", async () => {
    const safePaths = [
      "/tmp/playbook.yml",
      "/home/user/my-playbook_v2.yml",
      "/path/with spaces/playbook.yml",
      "/path/with.dots/play.book.yml",
    ];

    for (const p of safePaths) {
      const { SHELL_METACHARACTERS_PATTERN } =
        await import("@src/features/runner");
      expect(
        SHELL_METACHARACTERS_PATTERN.test(p),
        `Expected acceptance for: ${p}`,
      ).toBe(false);
    }
  });
});

describe("AnsiblePlaybookRunProvider", () => {
  it("implements Disposable", async () => {
    const { AnsiblePlaybookRunProvider } = await import("@src/features/runner");
    const provider = new AnsiblePlaybookRunProvider(
      { subscriptions: [] } as never,
      {} as never,
      {} as never,
    );
    expect(provider.dispose).toBeDefined();
    provider.dispose();
  });
});
