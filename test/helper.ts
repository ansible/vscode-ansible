import * as vscode from "vscode";
import * as path from "path";
import sinon from "sinon";
import { assert } from "chai";
import findProcess from "find-process";

import { LightSpeedCommands } from "../src/definitions/lightspeed";
import { integer } from "vscode-languageclient";
import axios from "axios";
import { LIGHTSPEED_ME_AUTH_URL } from "../src/definitions/lightspeed";
import { getInlineSuggestionItems } from "../src/features/lightspeed/inlineSuggestions";
import { rmSync } from "fs";

export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;

export const FIXTURES_BASE_PATH = path.join("test", "testFixtures");
export const ANSIBLE_COLLECTIONS_FIXTURES_BASE_PATH = path.resolve(
  FIXTURES_BASE_PATH,
  "common",
  "collections",
);
const LIGHTSPEED_ACCESS_TOKEN = process.env.LIGHTSPEED_ACCESS_TOKEN || "dummy";
const LIGHTSPEED_INLINE_SUGGESTION_WAIT_TIME =
  LIGHTSPEED_ACCESS_TOKEN === "dummy" ? 2000 : 10000;
const LIGHTSPEED_INLINE_SUGGESTION_AFTER_COMMIT_WAIT_TIME =
  LIGHTSPEED_ACCESS_TOKEN === "dummy" ? 200 : 2000;
const LIGHTSPEED_INLINE_SUGGESTION_AFTER_TRIGGER_WAIT_TIME = 100;
const LIGHTSPEED_INLINE_SUGGESTION_WAIT_WINDOW = 200;
/**
 * Activates the redhat.ansible extension
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function activate(docUri: vscode.Uri): Promise<any> {
  const extension = vscode.extensions.getExtension("redhat.ansible");
  const activation = await extension?.activate();

  try {
    doc = await vscode.workspace.openTextDocument(docUri);
    await waitForDiagnosisCompletion();
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
  await sleep(2000); //  Wait for server activation (reduced from 20000 to 2000)
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const getDocPath = (p: string): string => {
  return path.resolve(
    __dirname,
    path.join("..", "..", "..", "test", "testFixtures", p),
  );
};

export const getDocUriOutsideWorkspace = (fileName: string): string => {
  return path.resolve(
    __dirname,
    path.join(
      "..",
      "..",
      "..",
      "test",
      "testFixtureOutsideWorkspace",
      fileName,
    ),
  );
};

export const getDocUri = (p: string): vscode.Uri => {
  return vscode.Uri.file(getDocPath(p));
};

export async function updateSettings(
  setting: string,
  value: unknown,
  section = "ansible",
): Promise<void> {
  const ansibleConfiguration = vscode.workspace.getConfiguration(section);
  return ansibleConfiguration.update(setting, value);
}

export function deleteAlsCache(): void {
  const hostCacheBasePath = path.resolve(
    `${process.env.HOME}/.cache/ansible-language-server/`,
  );
  rmSync(hostCacheBasePath, { recursive: true, force: true });
}

export function setFixtureAnsibleCollectionPathEnv(
  prePendPath: string | undefined = undefined,
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
      options: "ro", // read-only option for volume mounts
    },
  ];
  await updateSettings("executionEnvironment.volumeMounts", volumeMounts);
}

export async function disableExecutionEnvironmentSettings(): Promise<void> {
  await updateSettings("executionEnvironment.enabled", false);
  await updateSettings("executionEnvironment.volumeMounts", []);
}

export async function enableLightspeedSettings(): Promise<void> {
  await updateSettings("lightspeed.enabled", true);
  await updateSettings("lightspeed.suggestions.enabled", true);
  await updateSettings("lightspeed.URL", process.env.TEST_LIGHTSPEED_URL);

  // Make sure content matches panel is enabled in a timely manner
  vscode.commands.executeCommand(
    "setContext",
    "redhat.ansible.lightspeedSuggestionsEnabled",
    true,
  );

  // Open content matches panel
  await vscode.commands.executeCommand(
    "ansible.lightspeed.trainingMatchPanel.focus",
  );
}

export async function disableLightspeedSettings(): Promise<void> {
  await updateSettings("lightspeed.enabled", false);
  await updateSettings("lightspeed.suggestions.enabled", false);
  await updateSettings("lightspeed.URL", "");
}

export async function _setInlineSuggestionsWaitWindow(
  t: number,
): Promise<void> {
  await updateSettings("lightspeed.suggestions.waitWindow", t);
}

export async function setInlineSuggestionsWaitWindow(): Promise<void> {
  await _setInlineSuggestionsWaitWindow(
    LIGHTSPEED_INLINE_SUGGESTION_WAIT_WINDOW,
  );
}

export async function resetInlineSuggestionsWaitWindow(): Promise<void> {
  await _setInlineSuggestionsWaitWindow(0);
}

export async function canRunLightspeedTests(): Promise<boolean> {
  // first check if environment variable is set or not
  if (!process.env.TEST_LIGHTSPEED_ACCESS_TOKEN) {
    console.warn(
      "Skipping lightspeed tests because TEST_LIGHTSPEED_ACCESS_TOKEN variable is not set.",
    );
    return false;
  }

  if (!process.env.TEST_LIGHTSPEED_URL) {
    console.warn(
      "Skipping lightspeed tests because TEST_LIGHTSPEED_URL variable is not set.",
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
      "Skipping lightspeed tests because project lightspeed path path not set.",
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
      },
    );
    result = status;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        "Skipping lightspeed tests because of the following error message: ",
        error.message,
      );
    } else {
      console.error(
        "Skipping lightspeed tests because of unexpected error: ",
        error,
      );
    }
    return false;
  }

  // finally, check if status code is not 200
  return result === 200;
}

export async function testDiagnostics(
  docUri: vscode.Uri,
  expectedDiagnostics: vscode.Diagnostic[],
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
        expectedDiagnostic.severity,
      );
      assert.strictEqual(actualDiagnostic.source, expectedDiagnostic.source);
    });
  }
}

export async function testHover(
  docUri: vscode.Uri,
  position: vscode.Position,
  expectedHover: vscode.Hover[],
): Promise<void> {
  const actualHover = (await vscode.commands.executeCommand(
    "vscode.executeHoverProvider",
    docUri,
    position,
  )) as vscode.Hover[];

  assert.strictEqual(actualHover.length, expectedHover.length);

  if (actualHover.length && expectedHover.length) {
    expectedHover.forEach((expectedItem, i) => {
      const actualItem = actualHover[i];
      assert.include(
        (actualItem.contents[i] as vscode.MarkdownString).value,
        expectedItem.contents[i].toString(),
      );
    });
  }
}

export async function testInlineSuggestion(
  prompt: string,
  expectedModule: string,
  multiTask = false,
  insertText = "",
  typeOver = false,
  typeOverBeforeAPIReturn = false,
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
      new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE),
    );
    edit.replace(
      replaceRange,
      multiTask ? `# ${prompt}\n` : `- name: ${prompt}\n`,
    );
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
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_TRIGGER,
  );

  // If typeOverBeforeAPIReturn flag is set, do not wait for long.
  // Since the artificial delay time for mock server's completion API
  // is set to 500 msecs, wait for 100 msecs to trigger the completion
  // API call and resume execution before the API return.
  await sleep(
    typeOverBeforeAPIReturn
      ? LIGHTSPEED_INLINE_SUGGESTION_AFTER_TRIGGER_WAIT_TIME
      : LIGHTSPEED_INLINE_SUGGESTION_WAIT_TIME,
  );

  if (insertText) {
    // If insertText is specified, insertText at the current cursor position.
    // It simulates the scenario that user clicks the accept button on widget.
    assert(editor);
    await editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, insertText);
    });
  } else if (typeOver || typeOverBeforeAPIReturn) {
    // If typeOver is set to true, simulate typing a space character, which will
    // trigger an inlineSuggestionFeedback event with UserAction.REJECTED
    await vscode.commands.executeCommand("type", { text: " " });
    // Wait for allowing the code to send a feedback.
    await sleep(LIGHTSPEED_INLINE_SUGGESTION_WAIT_TIME);
  } else {
    await vscode.commands.executeCommand(
      LightSpeedCommands.LIGHTSPEED_SUGGESTION_COMMIT,
    );
  }
  await sleep(LIGHTSPEED_INLINE_SUGGESTION_AFTER_COMMIT_WAIT_TIME);

  // If typeOver is set to true, the suggestion will disappear.
  // Otherwise, the suggestion is inserted to the doc and we can verify the result.
  if (!typeOver && !typeOverBeforeAPIReturn) {
    // get the committed suggestion
    const suggestionRange = new vscode.Range(
      new vscode.Position(writePosition.line + 1, writePosition.character),
      new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE),
    );

    const docContentAfterSuggestion = doc.getText(suggestionRange).trim();

    // assert
    assert.include(docContentAfterSuggestion, expectedModule);
  }
}

export async function testInlineSuggestionNotTriggered(
  prompt: string,
  multiTask = false,
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
      new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE),
    );
    edit.replace(
      replaceRange,
      multiTask ? `# ${prompt}\n` : `- name: ${prompt}\n`,
    );
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
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_TRIGGER,
  );
  await sleep(LIGHTSPEED_INLINE_SUGGESTION_WAIT_TIME);
  await vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_COMMIT,
  );
  await sleep(LIGHTSPEED_INLINE_SUGGESTION_AFTER_COMMIT_WAIT_TIME);

  // get the committed suggestion
  const suggestionRange = new vscode.Range(
    new vscode.Position(writePosition.line + 1, writePosition.character),
    new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE),
  );

  const docContentAfterSuggestion = doc.getText(suggestionRange).trim();

  // assert

  assert.include(docContentAfterSuggestion, "");
  assert.isFalse(
    getInlineSuggestionItemsSpy.called,
    "getInlineSuggestionItems should not be called",
  );
}

export async function testInlineSuggestionCursorPositions(
  prompt: string,
  newLineSpaces: number,
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
      new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE),
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
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_TRIGGER,
  );

  await sleep(LIGHTSPEED_INLINE_SUGGESTION_WAIT_TIME);
  await vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_COMMIT,
  );
  await sleep(LIGHTSPEED_INLINE_SUGGESTION_AFTER_COMMIT_WAIT_TIME);

  // get the committed suggestion
  const suggestionRange = new vscode.Range(
    new vscode.Position(writePosition.line + 1, writePosition.character),
    new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE),
  );

  const docContentAfterSuggestion = doc.getText(suggestionRange).trim();

  // assert

  assert.include(docContentAfterSuggestion, "");
  assert.isFalse(
    getInlineSuggestionItemsSpy.called,
    "getInlineSuggestionItems should not be called",
  );
}

export async function testValidJinjaBrackets(
  prompt: string,
  expectedValidJinjaInlineVar: string,
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
      new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE),
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
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_TRIGGER,
  );
  await sleep(LIGHTSPEED_INLINE_SUGGESTION_WAIT_TIME);
  await vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_COMMIT,
  );
  await sleep(LIGHTSPEED_INLINE_SUGGESTION_AFTER_COMMIT_WAIT_TIME);

  // get the committed suggestion
  const suggestionRange = new vscode.Range(
    new vscode.Position(writePosition.line + 1, writePosition.character),
    new vscode.Position(integer.MAX_VALUE, integer.MAX_VALUE),
  );

  const docContentAfterSuggestion = doc.getText(suggestionRange).trim();

  // assert
  assert.include(docContentAfterSuggestion, expectedValidJinjaInlineVar);
}

export async function waitForDiagnosisCompletion(
  interval = 100,
  timeout = 2000,
) {
  let started = false;
  let done = false;
  let elapsed = 0;
  // If either ansible-lint or ansible-playbook has started within the
  // specified timeout value (default: 2000 msecs), we'll wait until
  // it completes. Otherwise (e.g. when the validation is disabled),
  // exit after the timeout.
  while (!done && (started || elapsed < timeout)) {
    const processes = await findProcess("name", /ansible-(?:lint|playbook)/);
    if (!started && processes.length > 0) {
      started = true;
    } else if (started && processes.length === 0) {
      done = true;
    }
    await sleep(interval);
    elapsed += interval;
  }
}
