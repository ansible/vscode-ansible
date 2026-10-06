import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import {
  maxTestHoverDurationMs,
  setEeFixtureAnsibleCollectionPathEnv,
  testHover,
  unSetFixtureAnsibleCollectionPathEnv,
  waitForCondition,
  waitForHoverReady,
} from "@test/e2e/e2e.utils";
import {
  getUserAnsibleCollectionsPath,
  USR_SHARE_ANSIBLE_COLLECTIONS,
} from "@root/packages/ansible-language-server/test/eeCollectionsEnvUtils.js";

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

  describe("waitForCondition", () => {
    it("resolves immediately when condition is true", async () => {
      await expect(
        waitForCondition(() => true, { timeout: 500, interval: 50 }),
      ).resolves.toBeUndefined();
    });

    it("polls until condition becomes true", async () => {
      let callCount = 0;
      await waitForCondition(
        () => {
          callCount++;
          return callCount >= 3;
        },
        { timeout: 2000, interval: 10 },
      );
      expect(callCount).toBe(3);
    });

    it("throws on timeout when condition never becomes true", async () => {
      await expect(
        waitForCondition(() => false, {
          timeout: 100,
          interval: 10,
          description: "test condition",
        }),
      ).rejects.toThrow(/Timeout waiting for test condition after 100ms/);
    });

    it("uses default description in timeout error", async () => {
      await expect(
        waitForCondition(() => false, { timeout: 100, interval: 10 }),
      ).rejects.toThrow(/Timeout waiting for condition after 100ms/);
    });

    it("keeps polling when condition throws errors", async () => {
      let callCount = 0;
      await waitForCondition(
        () => {
          callCount++;
          if (callCount < 3) throw new Error("not ready");
          return true;
        },
        { timeout: 2000, interval: 10 },
      );
      expect(callCount).toBe(3);
    });

    it("works with async condition functions", async () => {
      let callCount = 0;
      await waitForCondition(
        async () => {
          callCount++;
          return callCount >= 2;
        },
        { timeout: 2000, interval: 10 },
      );
      expect(callCount).toBe(2);
    });
  });

  describe("waitForHoverReady", () => {
    it("resolves when hover returns non-empty result", async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        { contents: [{ value: "some hover content" }] },
      ]);

      await waitForHoverReady(docUri, position, 5000, 50, 500);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "vscode.executeHoverProvider",
        docUri,
        position,
      );
    });

    it("keeps polling until hover becomes available", async () => {
      let callCount = 0;
      vi.mocked(vscode.commands.executeCommand).mockImplementation(async () => {
        callCount++;
        if (callCount < 3) return [];
        return [{ contents: [{ value: "ready" }] }];
      });

      await waitForHoverReady(docUri, position, 5000, 10, 500);

      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it("times out when hover never returns results", async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([]);

      await expect(
        waitForHoverReady(docUri, position, 200, 20, 500),
      ).rejects.toThrow(/Timeout waiting for hover provider readiness/);
    });

    it("abandons hung hover attempt via per-attempt timeout", async () => {
      vi.mocked(vscode.commands.executeCommand).mockImplementation(
        () =>
          new Promise<vscode.Hover[]>(() => {
            // Intentionally never settles — simulates a hung hover provider.
          }),
      );

      await expect(
        waitForHoverReady(docUri, position, 200, 20, 50),
      ).rejects.toThrow(/Timeout waiting for hover provider readiness/);
    });
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

    it("retries when hover provider times out", async () => {
      let callCount = 0;
      vi.mocked(vscode.commands.executeCommand).mockImplementation(
        () =>
          new Promise<vscode.Hover[]>((resolve) => {
            callCount++;
            if (callCount < 3) {
              // First two attempts never settle — simulates a hung provider.
              return;
            }
            resolve([
              {
                contents: [
                  {
                    language: "yaml",
                    value: "Identifier. Can be used for documentation.",
                  },
                ],
              },
            ]);
          }),
      );

      await testHover(
        docUri,
        position,
        [{ contents: ["Identifier. Can be used for documentation."] }],
        { retries: 4, retryDelay: 0, attemptTimeout: 50 },
      );

      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it("retries when hover content does not match", async () => {
      let callCount = 0;
      vi.mocked(vscode.commands.executeCommand).mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return [{ contents: [{ value: "wrong content" }] }];
        }
        return [
          {
            contents: [{ value: "Identifier. Can be used for documentation." }],
          },
        ];
      });

      await testHover(
        docUri,
        position,
        [{ contents: ["Identifier. Can be used for documentation."] }],
        { retries: 4, retryDelay: 0, attemptTimeout: 500 },
      );

      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it("includes last error in failure message", async () => {
      vi.mocked(vscode.commands.executeCommand).mockImplementation(
        () =>
          new Promise<vscode.Hover[]>(() => {
            // Never settles — every attempt hits attemptTimeout.
          }),
      );

      await expect(
        testHover(docUri, position, [{ contents: ["expected"] }], {
          retries: 1,
          retryDelay: 0,
          attemptTimeout: 50,
        }),
      ).rejects.toThrow(/Last error: Hover provider did not respond within/);
    });

    it("fails after exhausting retries", async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([]);

      await expect(
        testHover(docUri, position, [{ contents: ["missing hover"] }], {
          retries: 1,
          retryDelay: 0,
          attemptTimeout: 5,
        }),
      ).rejects.toThrow(/Hover test failed after 2 attempts/);
    });
  });

  describe("setEeFixtureAnsibleCollectionPathEnv", () => {
    afterEach(() => {
      unSetFixtureAnsibleCollectionPathEnv();
    });

    it("prepends user ansible collections and usr-share paths before fixture collections", () => {
      setEeFixtureAnsibleCollectionPathEnv();
      const collectionsPath = process.env.ANSIBLE_COLLECTIONS_PATH ?? "";
      const userCollections = getUserAnsibleCollectionsPath();
      expect(collectionsPath.startsWith(`${userCollections}:`)).toBe(true);
      expect(collectionsPath).toContain(`${USR_SHARE_ANSIBLE_COLLECTIONS}:`);
      expect(collectionsPath).toContain("test/testFixtures");
    });
  });
});
