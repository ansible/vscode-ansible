import * as vscode from "vscode";
import * as path from "path";
import { assert } from "chai";
import findProcess from "find-process";

import { rmSync } from "fs";
import { PROJECT_ROOT } from "../setup";

let doc: vscode.TextDocument;

export const skip_ee: boolean =
  process.env.SKIP_PODMAN === "1" || process.env.SKIP_DOCKER === "1";

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

const FIXTURES_BASE_PATH = path.join("test", "testFixtures");
const ANSIBLE_COLLECTIONS_FIXTURES_BASE_PATH = path.resolve(
  PROJECT_ROOT,
  FIXTURES_BASE_PATH,
  "common",
  "collections",
);
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

    await vscode.window.showTextDocument(doc, {
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

const getDocPath = (p: string): string => {
  return path.resolve(PROJECT_ROOT, "test", "testFixtures", p);
};

export const getDocUriOutsideWorkspace = (fileName: string): string => {
  return path.resolve(
    PROJECT_ROOT,
    "test",
    "testFixtureOutsideWorkspace",
    fileName,
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

export function setFixtureAnsibleCollectionPathEnv(prePendPath?: string): void {
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

/**
 * Wait for diagnostics to appear from a specific source.
 * This is more reliable than process detection, especially on WSL where
 * findProcess may not work correctly.
 *
 * @param docUri - The document URI to check diagnostics for
 * @param expectedSource - The expected source of diagnostics (e.g., "ansible-lint")
 * @param expectedCount - The expected number of diagnostics (default: at least 1)
 * @param timeout - Maximum time to wait in milliseconds (default: 15000)
 * @param interval - Polling interval in milliseconds (default: 200)
 * @returns true if expected diagnostics were found, false if timed out
 */
export async function waitForDiagnosticsFromSource(
  docUri: vscode.Uri,
  expectedSource: string,
  expectedCount = 1,
  timeout = 15000,
  interval = 200,
): Promise<boolean> {
  let elapsed = 0;

  while (elapsed < timeout) {
    const diagnostics = vscode.languages.getDiagnostics(docUri);
    const sourceDiagnostics = diagnostics.filter(
      (d) => d.source === expectedSource,
    );

    if (sourceDiagnostics.length >= expectedCount) {
      return true;
    }

    await sleep(interval);
    elapsed += interval;
  }

  return false;
}

export async function testDiagnostics(
  docUri: vscode.Uri,
  expectedDiagnostics: vscode.Diagnostic[],
  pollTimeout = 5000,
): Promise<void> {
  let actualDiagnostics = vscode.languages.getDiagnostics(docUri);

  // Poll until we have the expected number of diagnostics
  // Use a longer default timeout to handle slow environments like WSL
  if (actualDiagnostics.length !== expectedDiagnostics.length) {
    const pollInterval = 100;
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

  const actualDiagnosticsInfo =
    actualDiagnostics.length > 0
      ? actualDiagnostics
          .map(
            (d, i) =>
              `  [${i}] source="${d.source}", message="${d.message}", severity=${d.severity}, range=${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character}`,
          )
          .join("\n")
      : "  (none)";

  const expectedDiagnosticsInfo =
    expectedDiagnostics.length > 0
      ? expectedDiagnostics
          .map(
            (d, i) =>
              `  [${i}] source="${d.source}", message="${d.message}", severity=${d.severity}`,
          )
          .join("\n")
      : "  (none)";

  assert.strictEqual(
    actualDiagnostics.length,
    expectedDiagnostics.length,
    `Expected ${expectedDiagnostics.length} diagnostics but got ${actualDiagnostics.length}.\n` +
      `Document: ${docUri.toString()}\n` +
      `Expected diagnostics:\n${expectedDiagnosticsInfo}\n` +
      `Actual diagnostics:\n${actualDiagnosticsInfo}`,
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

async function waitForDiagnosisCompletion(
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
    let processes: Array<{ name: string }> = [];
    try {
      const ansibleProcesses = await findProcess("name", "ansible");
      processes = ansibleProcesses.filter((p) =>
        /ansible-(?:lint|playbook)/.test(p.name),
      );
    } catch (error) {
      // If findProcess fails (e.g., due to system permissions or race conditions),
      // treat it as if no processes were found to avoid test failures.
      // This makes the function more resilient to transient errors.
      console.warn(
        `[waitForDiagnosisCompletion] Error checking for processes: ${error}`,
      );
      processes = [];
    }

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
