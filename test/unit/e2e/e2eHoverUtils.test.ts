import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import {
  maxTestHoverDurationMs,
  testHover,
} from "@test/e2e/e2e.utils";

const MOCHA_E2E_TIMEOUT_MS = 120_000;

describe("e2e hover utilities", () => {
  const docUri = vscode.Uri.file("/tmp/playbook.yml");
  const position = { line: 0, character: 4 } as vscode.Position;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("maxTestHoverDurationMs", () => {
    it("computes worst-case duration from retry options", () => {
      expect(
        maxTestHoverDurationMs({
          retries: 2,
          retryDelay: 100,
          attemptTimeout: 50,
        }),
      ).toBe(3 * 50 + 2 * 100);
    });

    it("default budget stays within e2e mocha timeout", () => {
      expect(maxTestHoverDurationMs()).toBeLessThanOrEqual(
        MOCHA_E2E_TIMEOUT_MS,
      );
      expect(maxTestHoverDurationMs()).toBe(110_000);
    });
  });

  describe("testHover", () => {
    it("returns when hover content matches on first attempt", async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        {
          contents: [{ value: "Identifier. Can be used for documentation." }],
        },
      ]);

      await testHover(docUri, position, [
        {
          contents: ["Identifier. Can be used for documentation."],
        },
      ]);

      expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
    });

    it("fails after exhausting retries", async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([]);

      await expect(
        testHover(
          docUri,
          position,
          [{ contents: ["missing hover"] }],
          { retries: 1, retryDelay: 0, attemptTimeout: 5 },
        ),
      ).rejects.toThrow(/Hover test failed after 2 attempts/);
    });
  });
});
