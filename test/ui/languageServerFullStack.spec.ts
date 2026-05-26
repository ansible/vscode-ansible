import { browser } from "@wdio/globals";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FIXTURES_DIR = path.resolve(process.cwd(), "test", "ui", "fixtures");
const VENV_DIR = path.join(FIXTURES_DIR, ".venv");
const VENV_BIN = path.join(VENV_DIR, "bin");
const VENV_PYTHON = path.join(VENV_BIN, "python");
const COMPLETION_PLAYBOOK = "completion-test.ansible.yml";

function shell(cmd: string, opts: Record<string, unknown> = {}): string {
  return execSync(cmd, {
    encoding: "utf-8",
    timeout: 300_000,
    stdio: ["pipe", "pipe", "pipe"],
    ...opts,
  }).trim();
}

describe("Language Server full stack e2e", function () {
  before(function () {
    this.timeout(600_000);
  });

  it("should create a virtual environment", function () {
    this.timeout(30_000);

    if (fs.existsSync(VENV_PYTHON)) {
      // Reuse cached venv from a prior run
      const version = shell(`"${VENV_PYTHON}" --version`);
      expect(version).toContain("Python");
      return;
    }

    shell(`python3 -m venv "${VENV_DIR}"`);
    expect(fs.existsSync(VENV_PYTHON)).toBe(true);

    shell(`"${VENV_BIN}/pip" install --upgrade pip`);
  });

  it("should install ansible-dev-tools in the venv", function () {
    this.timeout(480_000);

    const ansibleDoc = path.join(VENV_BIN, "ansible-doc");
    if (fs.existsSync(ansibleDoc)) {
      const version = shell(`"${ansibleDoc}" --version`);
      expect(version).toContain("ansible");
      return;
    }

    shell(`"${VENV_BIN}/pip" install ansible-dev-tools`, {
      timeout: 480_000,
    });

    expect(fs.existsSync(ansibleDoc)).toBe(true);
  });

  it("should install ansible.posix collection", function () {
    this.timeout(60_000);

    shell(
      `"${VENV_BIN}/ansible-galaxy" collection install ansible.posix --force`,
      { timeout: 60_000 },
    );

    const list = shell(`"${VENV_BIN}/ansible-galaxy" collection list`);
    expect(list).toContain("ansible.posix");
  });

  it("should write the environment cache for the LS", async function () {
    this.timeout(15_000);

    // Write the cache file so that CommandService in the LS process can
    // find the venv's bin directory.  The LS process (standalone Node,
    // no vscode module) resolves getWorkspaceRoot() via process.cwd(),
    // which vscode-languageclient sets to the first workspace folder.
    const cacheDir = path.join(
      FIXTURES_DIR,
      ".cache",
      "ansible-environments",
    );
    fs.mkdirSync(cacheDir, { recursive: true });
    const cacheFile = path.join(cacheDir, "environment.json");
    const cacheData = {
      selectedEnvironment: {
        pythonPath: VENV_PYTHON,
        binDir: VENV_BIN,
        displayName: "e2e-test-venv",
        timestamp: new Date().toISOString(),
      },
    };
    fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), "utf-8");
    expect(fs.existsSync(cacheFile)).toBe(true);

    // Verify the cache is readable
    const written = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
    expect(written.selectedEnvironment.binDir).toBe(VENV_BIN);
  });

  it("should return keyword completions at a task position", async function () {
    this.timeout(30_000);

    const fixtureUri = path.resolve(FIXTURES_DIR, COMPLETION_PLAYBOOK);

    // Open the playbook and request completions at a task-level position.
    // Line 10 (0-indexed) is "    - " — a new task entry where task
    // keywords (name, become, register, …) and module names are valid.
    const labels: string[] = await browser.executeWorkbench(
      async (vscode, uri: string) => {
        const doc = await vscode.workspace.openTextDocument(
          vscode.Uri.file(uri),
        );
        await vscode.window.showTextDocument(doc);

        // Wait for the LS to be ready
        await new Promise((r) => setTimeout(r, 3000));

        const pos = new vscode.Position(10, 6);
        const result = (await vscode.commands.executeCommand(
          "vscode.executeCompletionItemProvider",
          doc.uri,
          pos,
        )) as { items: Array<{ label: string | { label: string } }> };

        return (result?.items ?? []).map((item) =>
          typeof item.label === "string" ? item.label : item.label.label,
        );
      },
      fixtureUri,
    );

    // At a task position the LS returns task keyword completions and/or
    // module name completions.  We accept either — keywords come from
    // the LS's built-in keyword maps, module names come from
    // CollectionsService.getCollections() (which requires refresh()).
    const taskKeywords = ["name", "register", "when", "become", "block"];
    const hasKeywords = taskKeywords.some((kw) => labels.includes(kw));
    const hasModules = labels.some(
      (l) => l.includes(".") || l === "debug" || l === "ping",
    );
    expect(hasKeywords || hasModules).toBe(true);
  });

  it("should return module option completions from ansible-doc", async function () {
    this.timeout(60_000);

    const fixtureUri = path.resolve(FIXTURES_DIR, COMPLETION_PLAYBOOK);

    // Line 7 (0-indexed) is '        msg: "hello"' — this is under the
    // ansible.builtin.debug module. Requesting completions at line 7,
    // column 8 should trigger the LS to call ansible-doc for module
    // options.  If ansible-doc is reachable, we'll get options like
    // "msg", "var", "verbosity".
    const labels: string[] = await browser.executeWorkbench(
      async (vscode, uri: string) => {
        const doc = await vscode.workspace.openTextDocument(
          vscode.Uri.file(uri),
        );
        await vscode.window.showTextDocument(doc);

        // Wait for the LS to settle
        await new Promise((r) => setTimeout(r, 3000));

        const pos = new vscode.Position(7, 8);
        const result = (await vscode.commands.executeCommand(
          "vscode.executeCompletionItemProvider",
          doc.uri,
          pos,
        )) as { items: Array<{ label: string | { label: string } }> };

        return (result?.items ?? []).map((item) =>
          typeof item.label === "string" ? item.label : item.label.label,
        );
      },
      fixtureUri,
    );

    // If the LS successfully called ansible-doc for ansible.builtin.debug,
    // we should see its options.
    const debugOptions = ["msg", "var", "verbosity"];
    const foundOptions = debugOptions.filter((opt) => labels.includes(opt));

    expect(foundOptions.length).toBeGreaterThan(0);
  });
});
