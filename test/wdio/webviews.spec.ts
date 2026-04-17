/**
 * @file Webview tests for devfile, devcontainer, welcome page, and LLM
 * provider settings panels.
 *
 * Each test opens a webview via its VS Code command, switches into the
 * webview iframe context, and asserts on rendered content. Because the
 * webviews use Vue, a polling helper ({@link waitForWebviewText}) retries
 * until the framework has hydrated and text is visible.
 */
/// <reference types="wdio-vscode-service" />

import assert from "node:assert/strict";
import { browser } from "@wdio/globals";

/** Close all open editor tabs via the VS Code API. */
async function closeAllEditors(): Promise<void> {
  await browser.executeWorkbench(async (vscode) => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });
  await browser.pause(500);
}

/**
 * Execute a VS Code command by ID. Uses `executeWorkbench` to avoid
 * command palette timing issues.
 * @param commandId - The fully qualified command identifier.
 */
async function runCommand(commandId: string): Promise<void> {
  await browser.executeWorkbench(async (vscode, cmd: string) => {
    await vscode.commands.executeCommand(cmd);
  }, commandId);
}

/**
 * Poll a webview's body text until `textCheck` returns `true`.
 *
 * Handles Vue's async rendering: the webview DOM may exist before Vue
 * hydrates, so this retries until text appears.
 *
 * @param titlePattern - Regex matched against the webview tab title.
 * @param textCheck - Predicate applied to `body.getText()` each poll.
 * @param timeout - Maximum wait in milliseconds (default 30 s).
 * @returns The body text that satisfied the check.
 */
async function waitForWebviewText(
  titlePattern: RegExp,
  textCheck: (text: string) => boolean,
  timeout = 30_000,
): Promise<string> {
  const workbench = await browser.getWorkbench();
  let lastText = "";
  await browser.waitUntil(
    async () => {
      try {
        const webview = await workbench.getWebviewByTitle(titlePattern);
        await webview.open();
        const body = await $("body");
        if (await body.isExisting()) {
          lastText = await body.getText();
        }
        await webview.close();
        return textCheck(lastText);
      } catch {
        return false;
      }
    },
    {
      timeout,
      interval: 2000,
      timeoutMsg: `Webview text check failed. Last text: "${lastText.slice(0, 300)}"`,
    },
  );
  return lastText;
}

describe("Webview tests", () => {
  describe("Devfile and Devcontainer webviews", () => {
    afterEach(async () => {
      await closeAllEditors();
    });

    it("should open the devfile creation webview", async function () {
      this.timeout(60_000);
      await runCommand("ansible.content-creator.create-devfile");
      await browser.pause(3000);

      const workbench = await browser.getWorkbench();
      const webview = await workbench.getWebviewByTitle(/Create Devfile/);
      await webview.open();
      try {
        const form = await $("#devfile-form");
        await form.waitForExist({ timeout: 20_000 });
        assert.ok(await form.isExisting());
      } finally {
        await webview.close();
      }
    });

    it("should open the devcontainer creation webview", async function () {
      this.timeout(60_000);
      await runCommand("ansible.content-creator.create-devcontainer");
      await browser.pause(3000);

      const workbench = await browser.getWorkbench();
      const webview = await workbench.getWebviewByTitle(/Create Devcontainer/);
      await webview.open();
      try {
        const form = await $("#devcontainer-form");
        await form.waitForExist({ timeout: 20_000 });
        assert.ok(await form.isExisting());
      } finally {
        await webview.close();
      }
    });
  });

  describe("Welcome page webview", () => {
    before(async function () {
      this.timeout(60_000);
      await closeAllEditors();
      await runCommand("ansible.content-creator.menu");
      await browser.pause(5000);
    });

    after(async () => {
      await closeAllEditors();
    });

    it("should display the welcome page header", async function () {
      this.timeout(60_000);
      const text = await waitForWebviewText(/Ansible Development Tools/, (t) =>
        t.includes("Ansible Development Tools"),
      );
      assert.ok(text.includes("Ansible Development Tools"));
    });

    it("should display the welcome page subtitle", async function () {
      this.timeout(60_000);
      const text = await waitForWebviewText(/Ansible Development Tools/, (t) =>
        t.includes("Create, test and deploy"),
      );
      assert.ok(text.includes("Create, test and deploy"));
    });

    it("should display the MCP Server section", async function () {
      this.timeout(60_000);
      const text = await waitForWebviewText(/Ansible Development Tools/, (t) =>
        t.includes("MCP Server"),
      );
      assert.ok(text.includes("MCP Server"));
    });
  });

  describe("LLM Provider settings webview", () => {
    before(async function () {
      this.timeout(60_000);
      await closeAllEditors();
      await runCommand("ansible.lightspeed.openLlmProviderSettings");
      await browser.pause(5000);
    });

    after(async () => {
      await closeAllEditors();
    });

    it("should open LLM Provider Settings webview", async function () {
      this.timeout(60_000);
      const text = await waitForWebviewText(/LLM Provider/, (t) =>
        t.includes("LLM Provider"),
      );
      assert.ok(text.includes("LLM Provider"));
    });

    it("should list LLM providers", async function () {
      this.timeout(60_000);
      const text = await waitForWebviewText(
        /LLM Provider/,
        (t) =>
          t.includes("IBM watsonx") &&
          t.includes("Google Gemini") &&
          t.includes("Red Hat AI"),
      );
      for (const label of ["IBM watsonx", "Google Gemini", "Red Hat AI"]) {
        assert.ok(text.includes(label), `Expected provider: ${label}`);
      }
    });

    it("should have an edit button for providers", async function () {
      this.timeout(30_000);
      const workbench = await browser.getWorkbench();
      const webview = await workbench.getWebviewByTitle(/LLM Provider/);
      await webview.open();
      try {
        const editButtons = await $$("button.edit-btn");
        assert.ok(editButtons.length > 0, "Expected at least one .edit-btn");
      } finally {
        await webview.close();
      }
    });

    it("should have Connect buttons for providers", async function () {
      this.timeout(30_000);
      const workbench = await browser.getWorkbench();
      const webview = await workbench.getWebviewByTitle(/LLM Provider/);
      await webview.open();
      try {
        const body = await $("body");
        const text = await body.getText();
        const connectCount = (text.match(/Connect/g) || []).length;
        assert.ok(
          connectCount >= 2,
          `Expected multiple Connect buttons, found ${connectCount}`,
        );
      } finally {
        await webview.close();
      }
    });
  });
});
