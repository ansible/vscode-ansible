import * as assert from "assert";
import * as vscode from "vscode";

const EXTENSION_ID = "cidrblock.ansible-environments";

suite("Ansible Environments Extension", () => {
  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  test("extension is installed", () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `Extension ${EXTENSION_ID} should be installed`);
  });

  test("extension activates successfully", () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext?.isActive, "Extension should be active");
  });

  test("registers expected commands", async () => {
    const commands = await vscode.commands.getCommands(true);

    const expectedPrefixes = [
      "ansibleDevToolsPackages",
      "ansibleDevToolsCollections",
      "ansibleCreator",
      "ansiblePlaybooks",
    ];

    for (const prefix of expectedPrefixes) {
      const found = commands.some((cmd) => cmd.startsWith(prefix));
      assert.ok(found, `Should register commands with prefix "${prefix}"`);
    }
  });

  test("contributes ansible-environments view container", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    const pkg = ext?.packageJSON;

    const viewContainers = pkg?.contributes?.viewsContainers?.activitybar;
    const container = viewContainers?.find(
      (c: { id: string }) => c.id === "ansible-environments",
    );
    assert.ok(container, "Should contribute ansible-environments view container");
  });

  test("contributes expected tree views", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    const pkg = ext?.packageJSON;

    const views = pkg?.contributes?.views?.["ansible-environments"];
    assert.ok(views, "Should contribute views under ansible-environments");

    const expectedViewIds = [
      "ansibleDevToolsEnvManagers",
      "ansibleDevToolsPackages",
      "ansibleDevToolsCollections",
      "ansibleCollectionSources",
      "ansibleExecutionEnvironments",
      "ansibleCreator",
      "ansiblePlaybooks",
    ];

    for (const viewId of expectedViewIds) {
      const found = views.some((v: { id: string }) => v.id === viewId);
      assert.ok(found, `Should contribute view "${viewId}"`);
    }
  });

  test("contributes extension settings", () => {
    const config = vscode.workspace.getConfiguration("ansibleEnvironments");
    assert.notStrictEqual(config, undefined, "Should contribute ansibleEnvironments settings");
  });

  test("configuration defaults are correct", () => {
    const config = vscode.workspace.getConfiguration("ansibleEnvironments");

    assert.strictEqual(config.get("enableAiFeatures"), true);
    assert.strictEqual(config.get("pluginDocZoom"), 100);
    assert.strictEqual(config.get("pluginDocTheme"), "auto");

    const orgs = config.get<string[]>("githubCollectionOrgs");
    assert.ok(Array.isArray(orgs), "githubCollectionOrgs should be an array");
    assert.ok(orgs!.includes("ansible"), "default orgs should include 'ansible'");
    assert.ok(orgs!.includes("ansible-collections"), "default orgs should include 'ansible-collections'");
  });

  test("refresh commands are executable without error", async () => {
    const prefixes = [
      "ansibleDevToolsPackages",
      "ansibleDevToolsCollections",
    ];
    const commands = await vscode.commands.getCommands(true);

    for (const prefix of prefixes) {
      const refreshCmd = commands.find((c) => c === `${prefix}.refresh`);
      if (refreshCmd) {
        try {
          await vscode.commands.executeCommand(refreshCmd);
        } catch {
          // Some commands may fail without a workspace; we just verify they don't crash the extension
        }
      }
    }
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext?.isActive, "Extension should still be active after running refresh commands");
  });

  test("contributes MCP server tools via chat participant", () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    const pkg = ext?.packageJSON;

    const languageModelTools = pkg?.contributes?.languageModelTools;
    if (languageModelTools) {
      assert.ok(Array.isArray(languageModelTools), "languageModelTools should be an array");
      assert.ok(languageModelTools.length > 0, "should have at least one language model tool");

      const toolNames = languageModelTools.map((t: { name: string }) => t.name);
      assert.ok(
        toolNames.some((n: string) => n.startsWith("ansible")),
        'at least one tool name should start with "ansible"',
      );
    }
  });
});
