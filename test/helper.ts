import * as vscode from "vscode";
import * as path from "path";
import sinon from "sinon";
import { assert } from "chai";
import findProcess from "find-process";

import { LightSpeedCommands } from "../src/definitions/lightspeed";
import { integer } from "vscode-languageclient";
import { LIGHTSPEED_ME_AUTH_URL } from "../src/definitions/lightspeed";
import { getInlineSuggestionItems } from "../src/features/lightspeed/inlineSuggestions";
import { rmSync } from "fs";

export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;

// Cache for tracking activated documents to avoid redundant initialization
const activatedDocuments = new Set<string>();
let isExtensionActivated = false;

/**
 * Clear the activation cache. Call this when settings change that affect document processing.
 * This ensures documents are fully re-validated with new settings.
 */
export function clearActivationCache(): void {
  activatedDocuments.clear();
  // Note: Closing editors happens in the test's before() hook via
  // vscode.commands.executeCommand("workbench.action.closeAllEditors")
  // which ensures the language server also clears its cache
}

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

  // Only activate extension once
  let activation;
  if (!isExtensionActivated) {
    activation = await extension?.activate();
    isExtensionActivated = true;
  } else {
    activation = extension?.exports;
  }

  try {
    doc = await vscode.workspace.openTextDocument(docUri);
    const docKey = docUri.toString();

    // Skip reinitialization if document was recently activated
    const needsFullInit = !activatedDocuments.has(docKey);

    editor = await vscode.window.showTextDocument(doc, {
      preview: true,
      preserveFocus: false,
    });

    if (needsFullInit) {
      await reinitializeAnsibleExtension();
      // Wait for any validation triggered by onDidOpen to complete
      // This prevents two validation processes from running simultaneously
      // Uses a shorter timeout (1500ms) to exit faster when validation is disabled
      await waitForDiagnosisCompletion(150, 1500);
      activatedDocuments.add(docKey);
    } else {
      // Even for cached documents, ensure language is set
      await vscode.languages.setTextDocumentLanguage(doc, "ansible");
      await sleep(100); // Minimal wait for language mode switch
    }

    return activation;
  } catch (e) {
    console.error("Error from activation -> ", e);
  }
}

async function reinitializeAnsibleExtension(): Promise<void> {
  // Force language change by setting to yaml first, then ansible
  // This ensures the language server receives a fresh onDidOpen event
  // even if the document was previously set to ansible
  if (doc.languageId === "ansible") {
    await vscode.languages.setTextDocumentLanguage(doc, "yaml");
    await sleep(100); // Brief wait for language change to process
  }

  await vscode.languages.setTextDocumentLanguage(doc, "ansible");
  // Wait for server activation with adaptive timeout
  const maxWait = 1500;
  const checkInterval = 100;
  let waited = 0;

  // Check if language server is ready by attempting to get diagnostics
  while (waited < maxWait) {
    await sleep(checkInterval);
    waited += checkInterval;

    // If we can get diagnostics, the server is likely ready
    const diagnostics = vscode.languages.getDiagnostics(doc.uri);
    if (diagnostics !== undefined) {
      // Server is responding, give it time to process onDidOpen event
      // This ensures any validation triggered by document opening has started
      await sleep(250);
      break;
    }
  }
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
    process.env.ANSIBLE_COLLECTIONS_PATH = `${prePendPath}:${ANSIBLE_COLLECTIONS_FIXTURES_BASE_PATH}`;
  } else {
    process.env.ANSIBLE_COLLECTIONS_PATH =
      ANSIBLE_COLLECTIONS_FIXTURES_BASE_PATH;
  }
}

export function unSetFixtureAnsibleCollectionPathEnv(): void {
  process.env.ANSIBLE_COLLECTIONS_PATH = undefined;
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
  await updateSettings("lightspeed.apiEndpoint", "");
  await updateSettings("lightspeed.provider", "wca");
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

  try {
    const response: Response = await fetch(
      `${ansibleLightspeedURL}${LIGHTSPEED_ME_AUTH_URL}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (response.status !== 200) {
      console.error(
        `Skipping lightspeed tests because the request to lightspeed me endpoint failed with status code: ${response.status} and status message: ${response.statusText}`,
        response.statusText,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Skipping lightspeed tests because of unexpected error: ",
      error,
    );
    return false;
  }
}

export async function testDiagnostics(
  docUri: vscode.Uri,
  expectedDiagnostics: vscode.Diagnostic[],
): Promise<void> {
  let actualDiagnostics = vscode.languages.getDiagnostics(docUri);

  // Poll until we have the expected number of diagnostics
  // Since waitForDiagnosisCompletion already waits for processes, this should be quick
  if (actualDiagnostics.length !== expectedDiagnostics.length) {
    const pollTimeout = 1500; // Reduced - most diagnostics should be ready by now
    const pollInterval = 50; // Very fast polling for quick response
    let elapsed = 0;

    while (
      elapsed < pollTimeout &&
      actualDiagnostics.length !== expectedDiagnostics.length
    ) {
      await sleep(pollInterval);
      elapsed += pollInterval;
      actualDiagnostics = vscode.languages.getDiagnostics(docUri);
    }
  }

  assert.strictEqual(
    actualDiagnostics.length,
    expectedDiagnostics.length,
    `Expected ${expectedDiagnostics.length} diagnostics but got ${actualDiagnostics.length}`,
  );

  if (actualDiagnostics.length && expectedDiagnostics.length) {
    expectedDiagnostics.forEach((expectedDiagnostic, i) => {
      const actualDiagnostic = actualDiagnostics[i];
      assert.include(
        actualDiagnostic.message,
        expectedDiagnostic.message,
        `Expected message ${expectedDiagnostic.message} but got ${actualDiagnostic.message}`,
      ); // subset of expected message
      assert.deepEqual(
        actualDiagnostic.range,
        expectedDiagnostic.range,
        `Expected range ${expectedDiagnostic.range} but got ${actualDiagnostic.range}`,
      );
      assert.strictEqual(
        actualDiagnostic.severity,
        expectedDiagnostic.severity,
        `Expected severity ${expectedDiagnostic.severity} but got ${actualDiagnostic.severity}`,
      );
      assert.strictEqual(
        actualDiagnostic.source,
        expectedDiagnostic.source,
        `Expected source ${expectedDiagnostic.source} but got ${actualDiagnostic.source}`,
      );
    });
  }
}

export async function testHover(
  docUri: vscode.Uri,
  position: vscode.Position,
  expectedHover: vscode.Hover[],
): Promise<void> {
  const actualHover: vscode.Hover[] = await vscode.commands.executeCommand(
    "vscode.executeHoverProvider",
    docUri,
    position,
  );

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
  interval = 150,
  timeout = 3000,
  quickCheckTimeout = 500, // Quick check period to detect if validation is disabled
) {
  let started = false;
  let done = false;
  let elapsed = 0;
  let consecutiveZeroChecks = 0;
  const requiredConsecutiveZeros = 2; // Need 2 consecutive checks with no processes

  // If either ansible-lint or ansible-playbook has started within the
  // specified timeout value (default: 3000 msecs), we'll wait until
  // it completes. Otherwise (e.g. when the validation is disabled),
  // exit after the timeout.
  while (!done && (started || elapsed < timeout)) {
    const ansibleProcesses = await findProcess("name", "ansible");
    const processes = ansibleProcesses.filter((p) =>
      /ansible-(?:lint|playbook)/.test(p.name),
    );

    if (!started && processes.length > 0) {
      started = true;
      consecutiveZeroChecks = 0;
    } else if (started && processes.length === 0) {
      consecutiveZeroChecks++;
      if (consecutiveZeroChecks >= requiredConsecutiveZeros) {
        done = true;
      }
    } else if (processes.length > 0) {
      consecutiveZeroChecks = 0;
    }

    // Early exit if no process started after quick check period
    // This handles the case when validation is disabled
    if (!started && elapsed >= quickCheckTimeout) {
      break;
    }

    if (!done) {
      await sleep(interval);
      elapsed += interval;
    }
  }

  // Give language server a brief moment to publish diagnostics after process completes
  if (started && done) {
    await sleep(200);
  }
}
