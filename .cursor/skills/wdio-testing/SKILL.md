---
name: wdio-testing
description: >-
  Write, run, and debug WebDriverIO (WDIO) UI tests for the Ansible VS Code
  extension. Use when creating new WDIO specs, fixing test failures, adding
  webview or Lightspeed tests, or troubleshooting headless/CI execution.
---

# WDIO UI Testing

## Architecture

Each spec file (`test/wdio/*.spec.ts`) gets its own VS Code Electron instance.
The runner is configured in `wdio.conf.ts`, which uses `wdio-vscode-service` to
download, launch, and drive VS Code via ChromeDriver.

Key paths:

| Path | Purpose |
|------|---------|
| `wdio.conf.ts` | Runner config: capabilities, extensions dir, user settings |
| `test/wdio/*.spec.ts` | Test specs (Mocha BDD) |
| `test/wdio/tsconfig.json` | TypeScript config for WDIO tests (CommonJS target) |
| `test/wdio/fixtures/` | Ansible fixture files opened during tests |
| `test/wdio/mock-server.ts` | Express mock for Lightspeed API |
| `scripts/install-test-extensions.mjs` | Installs dependency extensions into `.wdio-vscode/extensions/` |
| `.wdio-vscode/` | VS Code binary cache + installed extensions (gitignored) |

## Running Tests

```bash
task wdio                   # full suite via Taskfile
npx pnpm test:wdio          # full suite via npm script
TS_NODE_PROJECT=test/wdio/tsconfig.json npx wdio run wdio.conf.ts --spec test/wdio/smoke.spec.ts  # single spec
```

The `TS_NODE_PROJECT` env var is required when invoking `wdio` directly; the
Taskfile and npm script set it automatically.

## Extension Activation (Critical)

The Ansible extension activates on `onLanguage:ansible`. In a fresh VS Code
session, the extension is **not active** until an Ansible file is opened.

Every spec that uses extension commands MUST:

1. Open a fixture file to trigger activation
2. Wait for `isActive` before proceeding

```typescript
// In the before() hook:
await browser.executeWorkbench(async (vscode, fixture: string) => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error("workspace missing");
  const uri = vscode.Uri.joinPath(folder.uri, fixture);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });
}, "playbook.ansible.yml");

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
```

See `smoke.spec.ts` for the canonical `waitForExtensionActive()` helper.

## `executeWorkbench` Closure Rules

`browser.executeWorkbench(callback, ...args)` serializes the callback and runs
it inside the VS Code extension host process. **Outer-scope variables are NOT
available** inside the callback. This is the single most common source of
confusing "X is not defined" errors.

```typescript
// BAD -- MOCK_URL is a module-level const; will throw "MOCK_URL is not defined"
const MOCK_URL = "http://localhost:3001";
await browser.executeWorkbench(async (vscode) => {
  const config = vscode.workspace.getConfiguration("ansible");
  await config.update("lightspeed.apiEndpoint", MOCK_URL, vscode.ConfigurationTarget.Global);
});

// GOOD -- pass as an argument after the callback
const url = MOCK_URL;
await browser.executeWorkbench(
  async (vscode, endpoint: string) => {
    const config = vscode.workspace.getConfiguration("ansible");
    await config.update("lightspeed.apiEndpoint", endpoint, vscode.ConfigurationTarget.Global);
  },
  url,
);
```

Rules:

- The first parameter is always `vscode` (the VS Code API).
- Additional arguments are positional after the callback.
- Only JSON-serializable values can be passed (no functions, classes, or
  circular structures).
- Helper functions defined at module scope (e.g. `countTabs(vscode)`) are
  also NOT available inside the callback. Inline the logic or wrap the entire
  `executeWorkbench` call in a helper that returns a serializable result.
- `require()` is not available in the workbench context. Use the `vscode`
  API or run Node utilities from the test runner process directly.

## Webview Testing

Webviews render inside nested iframes. After `webview.open()`, selectors like
`$("h1")` target the webview's DOM. Always call `webview.close()` when done
(use `try/finally`).

Vue-based webviews render asynchronously. Elements may exist in the DOM but have
empty text until the Vue app hydrates. Use `waitUntil` to poll for rendered
content:

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
      } catch { return false; }
    },
    { timeout, interval: 2000 },
  );
  return lastText;
}
```

Open webview commands via `executeWorkbench` (not `workbench.executeCommand`)
to avoid command palette timing issues:

```typescript
await browser.executeWorkbench(
  async (vscode, cmd: string) => {
    await vscode.commands.executeCommand(cmd);
  },
  "ansible.content-creator.menu",
);
```

## Mock Server for Lightspeed

`test/wdio/mock-server.ts` is a standalone Express server with canned responses
for Lightspeed API endpoints.

Usage in a spec:

```typescript
import * as mockServer from "./mock-server";

before(async () => {
  await mockServer.start(3001);
  // point the extension at the mock
  await browser.executeWorkbench(
    async (vscode, endpoint: string) => { /* update setting */ },
    "http://localhost:3001",
  );
  await injectMockSession();
});

after(async () => {
  // restore original setting, then stop
  await mockServer.stop();
});
```

- `mockServer.setResponse(endpoint, status, body, delay?)` -- override a
  specific endpoint per test.
- `mockServer.resetResponses()` -- revert to defaults (call in `afterEach`).
- `injectMockSession()` -- calls the `ansible.lightspeed.mockSession` command
  to fake an authenticated user. Uses `waitUntil` because the command is only
  available after the extension finishes activating.

## Adding Dependency Extensions

If the extension under test gains new `extensionDependencies`, add them to the
`DEPENDENCY_EXTENSIONS` array in `scripts/install-test-extensions.mjs`:

```javascript
const DEPENDENCY_EXTENSIONS = [
  "ms-python.python",
  "ms-python.vscode-python-envs",
  "redhat.vscode-yaml",
  // add new entries here
];
```

Run `npx pnpm pretest:wdio` to install them into `.wdio-vscode/extensions/`.

## CI and Headless Execution

### Linux CI (GitHub Actions)

The Taskfile wraps the test command with `xvfb-run` on Linux:

```yaml
cmds:
  - "{{.XVFB}}npx pnpm test:wdio"
```

`XVFB` is set to `xvfb-run --auto-servernum` when Xvfb is available.

### `--disable-gpu`

Always set in `wdio.conf.ts` under `vscodeArgs`. Prevents GPU-related crashes
in headless environments. Safe on all platforms.

### Do NOT use `--no-sandbox`

This flag causes SIGSEGV crashes on many Linux systems (Fedora, newer kernels).
Electron's sandbox is required for stable operation under Xvfb.

### Wayland vs X11

On Wayland desktops, the VS Code window will be visible during local test runs.
This is expected; `xvfb-run` on CI handles headless. Do NOT set
`WAYLAND_DISPLAY=""` as it can trigger Xvfb/Electron crashes.

## Common Pitfalls

| Pitfall | Cause | Fix |
|---------|-------|-----|
| "X is not defined" inside `executeWorkbench` | Closure variable captured | Pass as argument (see above) |
| Extension commands not found | Extension not activated | Open fixture + `waitUntil(isActive)` |
| `getCommands()` misses some commands | `registerTextEditorCommand` isn't listed | Use `getCommands()` without `true` filter, or just execute the command and catch errors |
| Notification check throws | `.monaco-list-row` not displayed | Wrap `getNotifications()` in try/catch |
| Webview text is empty | Vue hasn't rendered yet | Use `waitUntil` to poll for text content |
| SIGSEGV under Xvfb | `--no-sandbox` flag | Remove it; keep only `--disable-gpu` |
| `workbench.executeCommand` timeout | Command palette focus race | Use `executeWorkbench` + `vscode.commands.executeCommand` instead |

## Additional Resources

- Copy-paste code snippets: [patterns.md](patterns.md)
- Test runner docs: [test/README.md](../../../test/README.md)
- Full test architecture: [docs/development/test_code.md](../../../docs/development/test_code.md)
- wdio-vscode-service: <https://webdriver.io/docs/wdio-vscode-service>
