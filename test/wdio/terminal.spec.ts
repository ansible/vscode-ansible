/**
 * @file Terminal integration tests.
 *
 * Verifies that `adt` (Ansible Development Tools) is on `$PATH` and that
 * the VS Code terminal API can create / dispose terminals without error.
 * The `adt --version` check runs via `child_process.execSync` in the test
 * runner process rather than scraping terminal DOM, which is more reliable.
 */
import { browser } from "@wdio/globals";
import { strict as assert } from "node:assert";
import { execSync } from "node:child_process";

describe("Terminal integration", () => {
  it("should have adt available", async function () {
    this.timeout(30_000);

    const output = execSync("adt --version", {
      encoding: "utf8",
      timeout: 15_000,
    }).trim();

    const lower = output.toLowerCase();
    assert(
      lower.includes("ansible-core") && lower.includes("ansible-lint"),
      `Expected ansible-core and ansible-lint in output, got:\n${output}`,
    );
  });

  it("should create and dispose a terminal via the VS Code API", async function () {
    this.timeout(30_000);

    const ok = await browser.executeWorkbench(async (vscode) => {
      const terminal = vscode.window.createTerminal("WDIO Test");
      terminal.show();
      terminal.sendText("echo WDIO_OK", true);
      await new Promise((r) => setTimeout(r, 2000));
      terminal.dispose();
      return true;
    });

    assert(ok, "Terminal should be created and disposed without error");
  });
});
