import * as vscode from "vscode";
import * as path from "path";
import { assert } from "chai";

export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;

export const FIXTURES_BASE_PATH = path.join("test", "testFixtures");
export const ANSIBLE_COLLECTIONS_FIXTURES_BASE_PATH = path.resolve(
  FIXTURES_BASE_PATH,
  "common",
  "collections"
);

/**
 * Activates the redhat.ansible extension
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function activate(docUri: vscode.Uri): Promise<any> {
  const extension = vscode.extensions.getExtension("redhat.ansible");
  const activation = await extension?.activate();

  try {
    doc = await vscode.workspace.openTextDocument(docUri);
    editor = await vscode.window.showTextDocument(doc, {
      preview: true,
      preserveFocus: false,
    });

    await reinitializeAnsibleExtension();
    return activation;
  } catch (e) {
    console.error("Error from activation -> ", e);
  }
}

async function reinitializeAnsibleExtension(): Promise<void> {
  await vscode.languages.setTextDocumentLanguage(doc, "ansible");
  await sleep(20000); // Wait for server activation
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const getDocPath = (p: string): string => {
  return path.resolve(
    __dirname,
    path.join("..", "..", "..", "test", "testFixtures", p)
  );
};

export const getDocUri = (p: string): vscode.Uri => {
  return vscode.Uri.file(getDocPath(p));
};

export async function updateSettings(
  setting: string,
  value: unknown,
  section = "ansible"
): Promise<void> {
  const ansibleConfiguration = vscode.workspace.getConfiguration(section);
  const useGlobalSettings = true;
  return ansibleConfiguration.update(setting, value, useGlobalSettings);
}

export function setFixtureAnsibleCollectionPathEnv(
  prePendPath: string | undefined = undefined
): void {
  if (prePendPath) {
    process.env.ANSIBLE_COLLECTIONS_PATHS = `${prePendPath}:${ANSIBLE_COLLECTIONS_FIXTURES_BASE_PATH}`;
  } else {
    process.env.ANSIBLE_COLLECTIONS_PATHS =
      ANSIBLE_COLLECTIONS_FIXTURES_BASE_PATH;
  }
}

export function unSetFixtureAnsibleCollectionPathEnv(): void {
  process.env.ANSIBLE_COLLECTIONS_PATHS = undefined;
}

export async function enableExecutionEnvironmentSettings(): Promise<void> {
  await updateSettings("trace.server", "verbose", "ansibleServer");
  await updateSettings("executionEnvironment.enabled", true);

  const volumeMounts = [
    {
      src: ANSIBLE_COLLECTIONS_FIXTURES_BASE_PATH,
      dest: ANSIBLE_COLLECTIONS_FIXTURES_BASE_PATH,
      options: undefined,
    },
  ];
  await updateSettings("executionEnvironment.volumeMounts", volumeMounts);
}

export async function disableExecutionEnvironmentSettings(): Promise<void> {
  await updateSettings("executionEnvironment.enabled", false);
}

export async function testDiagnostics(
  docUri: vscode.Uri,
  expectedDiagnostics: vscode.Diagnostic[]
): Promise<void> {
  const actualDiagnostics = vscode.languages.getDiagnostics(docUri);

  assert.strictEqual(actualDiagnostics.length, expectedDiagnostics.length);

  if (actualDiagnostics.length && expectedDiagnostics.length) {
    expectedDiagnostics.forEach((expectedDiagnostic, i) => {
      const actualDiagnostic = actualDiagnostics[i];
      assert.include(actualDiagnostic.message, expectedDiagnostic.message); // subset of expected message
      assert.deepEqual(actualDiagnostic.range, expectedDiagnostic.range);
      assert.strictEqual(
        actualDiagnostic.severity,
        expectedDiagnostic.severity
      );
    });
  }
}

export async function testHover(
  docUri: vscode.Uri,
  position: vscode.Position,
  expectedHover: vscode.Hover[]
): Promise<void> {
  const actualHover = (await vscode.commands.executeCommand(
    "vscode.executeHoverProvider",
    docUri,
    position
  )) as vscode.Hover[];

  assert.strictEqual(actualHover.length, expectedHover.length);

  if (actualHover.length && expectedHover.length) {
    expectedHover.forEach((expectedItem, i) => {
      const actualItem = actualHover[i];
      assert.include(
        (actualItem.contents[i] as vscode.MarkdownString).value,
        expectedItem.contents[i].toString()
      );
    });
  }
}
