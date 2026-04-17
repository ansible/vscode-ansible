/**
 * @file Lightspeed integration tests backed by an Express mock server.
 *
 * The suite starts a local mock server ({@link mockServer}) that stubs every
 * Lightspeed API endpoint, then injects a fake authentication session so the
 * extension behaves as if the user is logged in. Each test verifies that a
 * Lightspeed command (explanation, generation, etc.) opens the expected
 * webview or degrades gracefully on API errors / timeouts.
 */
import { browser } from "@wdio/globals";
import { strict as assert } from "node:assert";
import * as mockServer from "./mock-server";

const MOCK_PORT = 3001;
const MOCK_URL = `http://localhost:${MOCK_PORT}`;

/** Count how many open tabs contain a webview panel. */
async function getWebviewTabCount(): Promise<number> {
  return (await browser.executeWorkbench(async (vscode) => {
    let count = 0;
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputWebview) count++;
      }
    }
    return count;
  })) as number;
}

/** Open `playbook.ansible.yml` from the WDIO fixtures folder to trigger extension activation. */
async function openPlaybookFixture(): Promise<void> {
  await browser.executeWorkbench(async (vscode, fixture: string) => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) throw new Error("WDIO workspace folder is missing");
    const uri = vscode.Uri.joinPath(folder.uri, fixture);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
  }, "playbook.ansible.yml");
}

/** Assert the Ansible extension is still active (not crashed or deactivated). */
async function assertExtensionStillActive(): Promise<void> {
  const active = await browser.executeWorkbench(async (vscode) => {
    const ext = vscode.extensions.getExtension("redhat.ansible");
    return ext?.isActive === true;
  });
  assert(active, "Ansible extension should remain active");
}

/**
 * Inject a fake authenticated Lightspeed session via the `ansible.lightspeed.mockSession`
 * command. Retries until the command is registered (up to 60 s).
 */
async function injectMockSession(): Promise<void> {
  await browser.waitUntil(
    async () => {
      const ok = await browser.executeWorkbench(async (vscode) => {
        try {
          await vscode.commands.executeCommand(
            "ansible.lightspeed.mockSession",
            {
              accessToken: "mock-access-token",
              accountId: "mock-account-id",
              accountLabel: "Mock WDIO User",
            },
          );
          return true;
        } catch {
          return false;
        }
      });
      return ok === true;
    },
    {
      timeout: 60_000,
      interval: 2000,
      timeoutMsg: "mockSession not available",
    },
  );
}

/** Close all open editor tabs. Safe to call during shutdown. */
async function closeAllEditors(): Promise<void> {
  await browser.executeWorkbench(async (vscode) => {
    try {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    } catch {
      /* ignore */
    }
  });
}

describe("Lightspeed with mock server", () => {
  let savedApiEndpoint: string | undefined;

  before(async function () {
    this.timeout(120_000);

    await openPlaybookFixture();
    await browser.waitUntil(
      async () => {
        const active = await browser.executeWorkbench(async (vscode) => {
          const ext = vscode.extensions.getExtension("redhat.ansible");
          return ext?.isActive === true;
        });
        return active === true;
      },
      {
        timeout: 60_000,
        interval: 2000,
        timeoutMsg: "Extension never activated",
      },
    );

    await mockServer.start(MOCK_PORT);

    savedApiEndpoint = (await browser.executeWorkbench(async (vscode) => {
      const config = vscode.workspace.getConfiguration("ansible");
      const val = config.inspect("lightspeed.apiEndpoint")?.globalValue;
      return typeof val === "string" ? val : undefined;
    })) as string | undefined;

    const url = MOCK_URL;
    await browser.executeWorkbench(async (vscode, endpoint: string) => {
      const config = vscode.workspace.getConfiguration("ansible");
      await config.update(
        "lightspeed.apiEndpoint",
        endpoint,
        vscode.ConfigurationTarget.Global,
      );
    }, url);

    await injectMockSession();
  });

  after(async function () {
    const prev = savedApiEndpoint;
    await browser.executeWorkbench(
      async (vscode, endpoint: string | undefined) => {
        const config = vscode.workspace.getConfiguration("ansible");
        await config.update(
          "lightspeed.apiEndpoint",
          endpoint,
          vscode.ConfigurationTarget.Global,
        );
      },
      prev,
    );
    await mockServer.stop();
  });

  beforeEach(async () => {
    await injectMockSession();
  });

  afterEach(async () => {
    mockServer.resetResponses();
    await closeAllEditors();
  });

  it("should have Lightspeed commands registered", async function () {
    this.timeout(60_000);
    const result = await browser.executeWorkbench(async (vscode) => {
      const cmds = await vscode.commands.getCommands();
      return cmds.filter(
        (c: string) =>
          typeof c === "string" && c.startsWith("ansible.lightspeed."),
      );
    });
    const cmds = result as string[];
    assert(
      cmds.length > 0,
      `Expected Lightspeed commands, got: ${JSON.stringify(cmds)}`,
    );
  });

  it("should open playbook explanation webview", async function () {
    this.timeout(60_000);
    await openPlaybookFixture();
    await browser.pause(2000);

    const beforeCount = await getWebviewTabCount();

    const ran = await browser.executeWorkbench(async (vscode) => {
      try {
        await vscode.commands.executeCommand(
          "ansible.lightspeed.playbookExplanation",
        );
        return true;
      } catch {
        return false;
      }
    });
    assert(ran, "playbookExplanation command should execute");

    await browser.waitUntil(
      async () => (await getWebviewTabCount()) > beforeCount,
      {
        timeout: 30_000,
        timeoutMsg: "Expected a webview tab for playbook explanation",
      },
    );
    await assertExtensionStillActive();
  });

  it("should open playbook generation webview", async function () {
    this.timeout(60_000);

    const beforeCount = await getWebviewTabCount();

    const ran = await browser.executeWorkbench(async (vscode) => {
      try {
        await vscode.commands.executeCommand(
          "ansible.lightspeed.playbookGeneration",
        );
        return true;
      } catch {
        return false;
      }
    });
    assert(ran, "playbookGeneration command should execute");

    await browser.waitUntil(
      async () => (await getWebviewTabCount()) > beforeCount,
      {
        timeout: 30_000,
        timeoutMsg: "Expected a webview tab for playbook generation",
      },
    );
    await assertExtensionStillActive();
  });

  it("should open role generation webview", async function () {
    this.timeout(60_000);

    const beforeCount = await getWebviewTabCount();

    const ran = await browser.executeWorkbench(async (vscode) => {
      try {
        await vscode.commands.executeCommand(
          "ansible.lightspeed.roleGeneration",
        );
        return true;
      } catch {
        return false;
      }
    });
    assert(ran, "roleGeneration command should execute");

    await browser.waitUntil(
      async () => (await getWebviewTabCount()) > beforeCount,
      {
        timeout: 30_000,
        timeoutMsg: "Expected a webview tab for role generation",
      },
    );
    await assertExtensionStillActive();
  });

  it("should handle API errors gracefully", async function () {
    mockServer.setResponse("POST /api/v1/completions", 401, {
      error: "unauthorized",
    });

    await openPlaybookFixture();
    await browser.executeWorkbench(async (vscode) => {
      try {
        await vscode.commands.executeCommand(
          "ansible.lightspeed.inlineSuggest.trigger",
        );
      } catch {
        /* may throw on 401 */
      }
    });

    await browser.pause(2000);
    await assertExtensionStillActive();
  });

  it("should handle server timeout gracefully", async function () {
    this.timeout(95_000);
    mockServer.setResponse(
      "POST /api/v0/ai/explanations/",
      200,
      { explanationId: "slow-mock", content: "delayed", format: "markdown" },
      60_000,
    );

    await openPlaybookFixture();
    await browser.executeWorkbench(async (vscode) => {
      try {
        await vscode.commands.executeCommand(
          "ansible.lightspeed.playbookExplanation",
        );
      } catch {
        /* expected to timeout */
      }
    });

    await browser.pause(32_000);
    await assertExtensionStillActive();
  });
});
