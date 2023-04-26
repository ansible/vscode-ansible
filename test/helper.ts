import * as vscode from "vscode";
import * as path from "path";
import { assert } from "chai";
import { LightSpeedCommands } from "../src/definitions/constants";
import { integer } from "vscode-languageclient";
import axios from "axios";
import { LIGHTSPEED_ME_AUTH_URL } from "../src/definitions/constants";

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

export async function enableLightspeedSettings(): Promise<void> {
  await updateSettings("lightspeed.enabled", true);
  await updateSettings("lightspeed.suggestions.enabled", true);
  await updateSettings("lightspeed.URL", process.env.TEST_LIGHTSPEED_URL);

  // disable lint validation
  await updateSettings("validation.lint.enabled", false);
}

export async function disableLightspeedSettings(): Promise<void> {
  await updateSettings("lightspeed.enabled", false);
  await updateSettings("lightspeed.suggestions.enabled", false);
  await updateSettings("lightspeed.URL", "");
}

export async function canRunLightspeedTests(): Promise<boolean> {
  // first check if environment variable is set or not
  if (!process.env.TEST_LIGHTSPEED_ACCESS_TOKEN) {
    console.warn(
      "Skipping lightspeed tests because TEST_LIGHTSPEED_ACCESS_TOKEN variable is not set."
    );
    return false;
  }

  if (!process.env.TEST_LIGHTSPEED_URL) {
    console.warn(
      "Skipping lightspeed tests because TEST_LIGHTSPEED_URL variable is not set."
    );
    return false;
  }

  // next, check if the access token is valid or not
  const ansibleLightspeedURL: string | undefined = vscode.workspace
    .getConfiguration("ansible")
    .get("lightspeed.URL");

  const token = process.env.TEST_LIGHTSPEED_ACCESS_TOKEN;

  if (!ansibleLightspeedURL) {
    console.warn(
      "Skipping lightspeed tests because project lightspeed path path not set."
    );
    return false;
  }

  let result: number;
  try {
    const { status } = await axios.get(
      `${ansibleLightspeedURL}${LIGHTSPEED_ME_AUTH_URL}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    result = status;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        "Skipping lightspeed tests because of the following error message: ",
        error.message
      );
    } else {
      console.error(
        "Skipping lightspeed tests because of unexpected error: ",
        error
      );
    }
    return false;
  }

  // finally, check if status code is not 200
  return result === 200;
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
      assert.strictEqual(actualDiagnostic.source, expectedDiagnostic.source);
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

export async function testInlineSuggestion(
  prompt: string,
  expectedModule: string
): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    throw new Error("No active editor found");
  }

  // this is the position where we have placeholder for the task name in the test fixture
  // i.e., <insert task name for ansible lightspeed suggestion here>
  const writePosition = new vscode.Position(4, 4);

  // replace the placeholder with valid task name for suggestions
  await editor.edit(async (edit) => {
    const replaceRange = new vscode.Range(
      writePosition,
      new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE)
    );
    edit.replace(replaceRange, `- name: ${prompt}\n`);
  });

  await vscode.commands.executeCommand("cursorMove", {
    to: "nextBlankLine",
  });

  await vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_TRIGGER
  );
  await sleep(15000);
  await vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_COMMIT
  );
  await sleep(2000);

  // get the committed suggestion
  const suggestionRange = new vscode.Range(
    new vscode.Position(writePosition.line + 1, writePosition.character),
    new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE)
  );

  const docContentAfterSuggestion = doc.getText(suggestionRange).trim();

  // assert
  assert.include(docContentAfterSuggestion, expectedModule);
}
