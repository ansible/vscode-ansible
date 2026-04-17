# WDIO Test Patterns

Copy-paste snippets for common test scenarios. See
[SKILL.md](SKILL.md) for the rules behind each pattern.

---

## Spec File Skeleton

```typescript
/// <reference types="wdio-vscode-service" />

import { browser } from "@wdio/globals";
import { strict as assert } from "node:assert";

describe("Feature name", () => {
  before(async function () {
    this.timeout(90_000);

    // 1. Trigger extension activation
    await browser.executeWorkbench(async (vscode, fixture: string) => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) throw new Error("workspace missing");
      const uri = vscode.Uri.joinPath(folder.uri, fixture);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });
    }, "playbook.ansible.yml");

    // 2. Wait for activation
    await browser.waitUntil(
      async () => {
        const active = await browser.executeWorkbench(async (vscode) => {
          const ext = vscode.extensions.getExtension("redhat.ansible");
          return ext?.isActive === true;
        });
        return active === true;
      },
      { timeout: 60_000, interval: 2000 },
    );
  });

  afterEach(async () => {
    await browser.executeWorkbench(async (vscode) => {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    });
  });

  it("should do something", async function () {
    this.timeout(30_000);
    // test body
  });
});
```

---

## Wait for Extension Active

Reusable helper (see `smoke.spec.ts`):

```typescript
async function waitForExtensionActive(timeout = 60_000): Promise<void> {
  await browser.waitUntil(
    async () =>
      browser.executeWorkbench(async (vscode) => {
        const ext = vscode.extensions.getExtension("redhat.ansible");
        if (!ext) return false;
        if (!ext.isActive) await ext.activate();
        return ext.isActive;
      }),
    { timeout, timeoutMsg: "Ansible extension did not activate in time" },
  );
}
```

---

## Execute a Command via API

Avoids command palette timing issues:

```typescript
async function runCommand(commandId: string): Promise<void> {
  await browser.executeWorkbench(
    async (vscode, cmd: string) => {
      await vscode.commands.executeCommand(cmd);
    },
    commandId,
  );
}
```

---

## Close All Editors

```typescript
async function closeAllEditors(): Promise<void> {
  await browser.executeWorkbench(async (vscode) => {
    try {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    } catch {
      /* may be unavailable during shutdown */
    }
  });
  await browser.pause(500);
}
```

---

## Open a Fixture File

```typescript
async function openPlaybookFixture(): Promise<void> {
  await browser.executeWorkbench(async (vscode, fixture: string) => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) throw new Error("WDIO workspace folder is missing");
    const uri = vscode.Uri.joinPath(folder.uri, fixture);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
  }, "playbook.ansible.yml");
}
```

---

## Read a VS Code Setting

```typescript
const value = await browser.executeWorkbench(async (vscode) => {
  return vscode.workspace
    .getConfiguration("ansible")
    .get("mcpServer.enabled");
});
```

---

## Update a VS Code Setting

External values must be passed as arguments:

```typescript
const newValue = "http://localhost:3001";
await browser.executeWorkbench(
  async (vscode, val: string) => {
    const config = vscode.workspace.getConfiguration("ansible");
    await config.update(
      "lightspeed.apiEndpoint",
      val,
      vscode.ConfigurationTarget.Global,
    );
  },
  newValue,
);
```

---

## Webview: Wait for Vue Content

```typescript
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
        if (await body.isExisting()) lastText = await body.getText();
        await webview.close();
        return textCheck(lastText);
      } catch {
        return false;
      }
    },
    {
      timeout,
      interval: 2000,
      timeoutMsg: `Webview text check failed. Last: "${lastText.slice(0, 300)}"`,
    },
  );
  return lastText;
}

// Usage:
const text = await waitForWebviewText(
  /Ansible Development Tools/,
  (t) => t.includes("MCP Server"),
);
assert.ok(text.includes("MCP Server"));
```

---

## Webview: Interact with DOM Elements

Always use `try/finally` to close the webview context:

```typescript
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
```

---

## Count Webview Tabs

Useful for asserting that a command opened a new webview:

```typescript
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

// Assert a webview was opened:
const before = await getWebviewTabCount();
await runCommand("ansible.lightspeed.playbookGeneration");
await browser.waitUntil(
  async () => (await getWebviewTabCount()) > before,
  { timeout: 30_000 },
);
```

---

## Lightspeed Mock Server Setup

```typescript
import * as mockServer from "./mock-server";

const MOCK_PORT = 3001;
const MOCK_URL = `http://localhost:${MOCK_PORT}`;

before(async function () {
  this.timeout(120_000);
  await openPlaybookFixture();
  await waitForExtensionActive();
  await mockServer.start(MOCK_PORT);

  // Point extension at mock
  const url = MOCK_URL;
  await browser.executeWorkbench(
    async (vscode, endpoint: string) => {
      const config = vscode.workspace.getConfiguration("ansible");
      await config.update(
        "lightspeed.apiEndpoint",
        endpoint,
        vscode.ConfigurationTarget.Global,
      );
    },
    url,
  );

  await injectMockSession();
});

after(async () => {
  // Restore original endpoint (save it in before())
  await mockServer.stop();
});

afterEach(() => {
  mockServer.resetResponses();
});
```

---

## Inject Mock Lightspeed Session

Waits for the `mockSession` command to become available:

```typescript
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
    { timeout: 60_000, interval: 2000, timeoutMsg: "mockSession not available" },
  );
}
```

---

## Override Mock Server Response Per Test

```typescript
it("should handle API errors gracefully", async () => {
  mockServer.setResponse("POST /api/v1/completions", 401, {
    error: "unauthorized",
  });
  // ... trigger the feature and assert graceful handling ...
});

it("should handle slow responses", async function () {
  this.timeout(95_000);
  mockServer.setResponse(
    "POST /api/v0/ai/explanations/",
    200,
    { explanationId: "slow", content: "delayed", format: "markdown" },
    60_000, // delay in ms
  );
  // ... trigger the feature ...
});
```

---

## Safe Notification Check

`workbench.getNotifications()` throws if the notification panel is not visible:

```typescript
async function hasNotification(
  workbench: Awaited<ReturnType<typeof browser.getWorkbench>>,
  pattern: RegExp,
): Promise<boolean> {
  try {
    const notifications = await workbench.getNotifications();
    for (const n of notifications) {
      if (pattern.test(await n.getMessage())) return true;
    }
  } catch {
    /* panel not visible */
  }
  return false;
}
```

---

## Terminal: Run a Command in Node

Do NOT use `executeWorkbench` for `child_process` -- `require` is unavailable
in the workbench context. Run directly from the test process:

```typescript
import { execSync } from "node:child_process";

it("should have adt available", () => {
  const output = execSync("adt --version", {
    encoding: "utf8",
    timeout: 15_000,
  }).trim();
  assert(output.toLowerCase().includes("ansible-core"));
});
```

---

## Terminal: Create and Dispose via API

```typescript
const ok = await browser.executeWorkbench(async (vscode) => {
  const terminal = vscode.window.createTerminal("WDIO Test");
  terminal.show();
  terminal.sendText("echo WDIO_OK", true);
  await new Promise((r) => setTimeout(r, 2000));
  terminal.dispose();
  return true;
});
assert(ok);
```
