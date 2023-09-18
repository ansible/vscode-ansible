import * as vscode from "vscode";
import * as path from "path";
import sinon from "sinon";
import { assert } from "chai";
import { LightSpeedCommands } from "../src/definitions/lightspeed";
import { integer } from "vscode-languageclient";
import axios from "axios";
import { LIGHTSPEED_ME_AUTH_URL } from "../src/definitions/lightspeed";
import { getInlineSuggestionItems } from "../src/features/lightspeed/inlineSuggestions";

export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;

export const FIXTURES_BASE_PATH = path.join("test", "testFixtures");
export const ANSIBLE_COLLECTIONS_FIXTURES_BASE_PATH = path.resolve(
  FIXTURES_BASE_PATH,
  "common",
  "collections"
);
const LIGHTSPEED_INLINE_SUGGESTION_WAIT_TIME = 10000;
const LIGHTSPEED_INLINE_SUGGESTION_AFTER_COMMIT_WAIT_TIME = 2000;
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

export const getDocUriOutsideWorkspace = (fileName: string): string => {
  return path.resolve(
    __dirname,
    path.join("..", "..", "..", "test", "testFixtureOutsideWorkspace", fileName)
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
  const lightspeedBaseURL: string | undefined = vscode.workspace
    .getConfiguration("ansible")
    .get("lightspeed.URL");

  const token = process.env.TEST_LIGHTSPEED_ACCESS_TOKEN;
  const ansibleLightspeedURL = lightspeedBaseURL?.trim();

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
  let editor = vscode.window.activeTextEditor;

  if (!editor) {
    throw new Error("No active editor found");
  }

  // this is the position where we have placeholder for the task name in the test fixture
  // i.e., <insert task name for ansible lightspeed suggestion here>
  // playbook used: lightspeed/playbook_1.yml
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

  editor = vscode.window.activeTextEditor;
  if (editor) {
    const currentPosition = editor.selection.active;
    const newLine = currentPosition.line + 1;
    const newColumn = currentPosition.character + 4;

    const newPosition = new vscode.Position(newLine, newColumn);

    await editor.edit((editBuilder) => {
      editBuilder.insert(newPosition, "    ");
    });

    editor.selection = new vscode.Selection(newPosition, newPosition);
    editor.revealRange(new vscode.Range(newPosition, newPosition));
  }
  await vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_TRIGGER
  );
  await sleep(LIGHTSPEED_INLINE_SUGGESTION_WAIT_TIME);
  await vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_COMMIT
  );
  await sleep(LIGHTSPEED_INLINE_SUGGESTION_AFTER_COMMIT_WAIT_TIME);

  // get the committed suggestion
  const suggestionRange = new vscode.Range(
    new vscode.Position(writePosition.line + 1, writePosition.character),
    new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE)
  );

  const docContentAfterSuggestion = doc.getText(suggestionRange).trim();

  // assert
  assert.include(docContentAfterSuggestion, expectedModule);
}

export async function testInlineSuggestionNotTriggered(
  prompt: string
): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    throw new Error("No active editor found");
  }
  const getInlineSuggestionItemsSpy = sinon.spy(getInlineSuggestionItems);
  // this is the position where we have placeholder for the task name in the test fixture
  // i.e., <insert task name for ansible lightspeed suggestion here>
  const writePosition = new vscode.Position(4, 4);

  // replace the placeholder with task name for suggestions
  await editor.edit(async (edit) => {
    const replaceRange = new vscode.Range(
      writePosition,
      new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE)
    );
    edit.replace(replaceRange, `${prompt}\n`);
  });

  await vscode.commands.executeCommand("cursorMove", {
    to: "nextBlankLine",
  });
  const currentPosition = editor.selection.active;
  const newLine = currentPosition.line + 1;
  const newColumn = currentPosition.character + 4;

  const newPosition = new vscode.Position(newLine, newColumn);

  await editor.edit((editBuilder) => {
    editBuilder.insert(newPosition, "    ");
  });

  editor.selection = new vscode.Selection(newPosition, newPosition);
  editor.revealRange(new vscode.Range(newPosition, newPosition));
  await vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_TRIGGER
  );
  await sleep(LIGHTSPEED_INLINE_SUGGESTION_WAIT_TIME);
  await vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_COMMIT
  );
  await sleep(LIGHTSPEED_INLINE_SUGGESTION_AFTER_COMMIT_WAIT_TIME);

  // get the committed suggestion
  const suggestionRange = new vscode.Range(
    new vscode.Position(writePosition.line + 1, writePosition.character),
    new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE)
  );

  const docContentAfterSuggestion = doc.getText(suggestionRange).trim();

  // assert

  assert.include(docContentAfterSuggestion, "");
  assert.isFalse(
    getInlineSuggestionItemsSpy.called,
    "getInlineSuggestionItems should not be called"
  );
}

export async function testInlineSuggestionCursorPositions(
  prompt: string,
  newLineSpaces: number
): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    throw new Error("No active editor found");
  }
  const getInlineSuggestionItemsSpy = sinon.spy(getInlineSuggestionItems);
  // this is the position where we have placeholder for the task name in the test fixture
  // i.e., <insert task name for ansible lightspeed suggestion here>
  const writePosition = new vscode.Position(4, 4);

  // replace the placeholder with task name for suggestions
  await editor.edit(async (edit) => {
    const replaceRange = new vscode.Range(
      writePosition,
      new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE)
    );
    edit.replace(replaceRange, `${prompt}\n`);
  });

  await vscode.commands.executeCommand("cursorMove", {
    to: "nextBlankLine",
  });
  const newLineText = " ".repeat(newLineSpaces);
  const currentPosition = editor.selection.active;
  const newLine = currentPosition.line + 1;
  const newColumn = currentPosition.character + newLineSpaces;

  const newPosition = new vscode.Position(newLine, newColumn);

  await editor.edit((editBuilder) => {
    editBuilder.insert(newPosition, newLineText);
  });

  editor.selection = new vscode.Selection(newPosition, newPosition);
  editor.revealRange(new vscode.Range(newPosition, newPosition));

  await vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_TRIGGER
  );

  await sleep(LIGHTSPEED_INLINE_SUGGESTION_WAIT_TIME);
  await vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_COMMIT
  );
  await sleep(LIGHTSPEED_INLINE_SUGGESTION_AFTER_COMMIT_WAIT_TIME);

  // get the committed suggestion
  const suggestionRange = new vscode.Range(
    new vscode.Position(writePosition.line + 1, writePosition.character),
    new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE)
  );

  const docContentAfterSuggestion = doc.getText(suggestionRange).trim();

  // assert

  assert.include(docContentAfterSuggestion, "");
  assert.isFalse(
    getInlineSuggestionItemsSpy.called,
    "getInlineSuggestionItems should not be called"
  );
}

export async function testValidJinjaBrackets(
  prompt: string,
  expectedValidJinjaInlineVar: string
): Promise<void> {
  let editor = vscode.window.activeTextEditor;

  if (!editor) {
    throw new Error("No active editor found");
  }

  // this is the position where we have placeholder for the task name in the test fixture
  // i.e., <insert task name for ansible lightspeed suggestion here>
  // playbook used: lightspeed/playbook_with_vars.yml
  const writePosition = new vscode.Position(17, 4);

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

  editor = vscode.window.activeTextEditor;
  if (editor) {
    const currentPosition = editor.selection.active;
    const newLine = currentPosition.line + 1;
    const newColumn = currentPosition.character + 4;

    const newPosition = new vscode.Position(newLine, newColumn);

    await editor.edit((editBuilder) => {
      editBuilder.insert(newPosition, "    ");
    });

    editor.selection = new vscode.Selection(newPosition, newPosition);
    editor.revealRange(new vscode.Range(newPosition, newPosition));
  }
  await vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_TRIGGER
  );
  await sleep(LIGHTSPEED_INLINE_SUGGESTION_WAIT_TIME);
  await vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_COMMIT
  );
  await sleep(LIGHTSPEED_INLINE_SUGGESTION_AFTER_COMMIT_WAIT_TIME);

  // get the committed suggestion
  const suggestionRange = new vscode.Range(
    new vscode.Position(writePosition.line + 1, writePosition.character),
    new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE)
  );

  const docContentAfterSuggestion = doc.getText(suggestionRange).trim();

  // assert
  assert.include(docContentAfterSuggestion, expectedValidJinjaInlineVar);
}
