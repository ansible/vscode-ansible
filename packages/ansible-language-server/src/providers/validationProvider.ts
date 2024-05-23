import IntervalTree from "@flatten-js/interval-tree";
import {
  Connection,
  Diagnostic,
  DiagnosticSeverity,
  Range,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ValidationManager } from "../services/validationManager";
import { WorkspaceFolderContext } from "../services/workspaceManager";
import { isPlaybook, parseAllDocuments } from "../utils/yaml";
import { CommandRunner } from "../utils/commandRunner";

/**
 * Validates the given document.
 * @param textDocument - the document to validate
 * @param linter - uses linter
 * @param quick - only re-evaluates YAML validation and uses lint cache
 * @returns Map of diagnostics per file.
 */
export async function doValidate(
  textDocument: TextDocument,
  validationManager: ValidationManager,
  quick = true,
  context?: WorkspaceFolderContext,
  connection?: Connection,
): Promise<Map<string, Diagnostic[]>> {
  let diagnosticsByFile: Map<string, Diagnostic[]> = new Map<
    string,
    Diagnostic[]
  >();
  if (quick || !context) {
    // get validation from cache
    diagnosticsByFile =
      validationManager.getValidationFromCache(textDocument.uri) ||
      new Map<string, Diagnostic[]>();
  } else {
    // full validation with ansible-lint or ansible syntax-check (if ansible-lint is not installed or disabled)

    const settings = await context.documentSettings.get(textDocument.uri);
    if (!settings.validation.enabled) {
      connection?.console.log("Validation disabled");

      // this is done to remove the cache as well
      const blankDiagnostics = new Map<string, Diagnostic[]>();
      blankDiagnostics.set(textDocument.uri, []);
      validationManager.processDiagnostics(textDocument.uri, blankDiagnostics);
      validationManager.cacheDiagnostics(textDocument.uri, blankDiagnostics);
      return blankDiagnostics;
    }

    // validation using ansible-lint
    if (settings.validation.lint.enabled) {
      const commandRunner = new CommandRunner(connection, context, settings);
      const lintExecutable = settings.executionEnvironment.enabled
        ? "ansible-lint"
        : settings.validation.lint.path;
      const lintAvailability =
        await commandRunner.getExecutablePath(lintExecutable);
      connection?.console.log(`Path for lint: ${lintAvailability}`);

      if (lintAvailability) {
        connection?.console.log("Validating using ansible-lint");
        diagnosticsByFile = await context.ansibleLint.doValidate(textDocument);
      } else {
        connection?.window.showErrorMessage(
          "Ansible-lint is not available. Kindly check the path or disable validation using ansible-lint",
        );
      }
    }

    // validate using ansible-playbook --syntax-check
    else {
      connection?.console.log("Validating using ansible syntax-check");

      if (isPlaybook(textDocument)) {
        connection?.console.log("playbook file");
        diagnosticsByFile =
          await context.ansiblePlaybook.doValidate(textDocument);
      } else {
        connection?.console.log("non-playbook file");
        diagnosticsByFile = new Map<string, Diagnostic[]>();
      }
    }

    if (!diagnosticsByFile.has(textDocument.uri)) {
      // In case there are no diagnostics for the file that triggered the
      // validation, set an empty array in order to clear the validation.
      diagnosticsByFile.set(textDocument.uri, []);
    }
    validationManager.cacheDiagnostics(textDocument.uri, diagnosticsByFile);
  }

  // attach quick validation for the inspected file
  for (const [fileUri, fileDiagnostics] of diagnosticsByFile) {
    if (textDocument.uri === fileUri) {
      fileDiagnostics.push(...getYamlValidation(textDocument));
    }
  }
  validationManager.processDiagnostics(textDocument.uri, diagnosticsByFile);
  return diagnosticsByFile;
}

export function getYamlValidation(textDocument: TextDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const yDocuments = parseAllDocuments(textDocument.getText());
  const rangeTree = new IntervalTree<Diagnostic>();
  yDocuments.forEach((yDoc) => {
    yDoc.errors.forEach((error) => {
      const [errStart, errEnd] = error.pos;
      if (errStart) {
        const start = textDocument.positionAt(errStart);
        const end = textDocument.positionAt(errEnd);

        const range = Range.create(start, end);

        let severity: DiagnosticSeverity;
        switch (error.name) {
          case "YAMLParseError":
            severity = DiagnosticSeverity.Error;
            break;
          case "YAMLWarning":
            severity = DiagnosticSeverity.Warning;
            break;
          default:
            severity = DiagnosticSeverity.Information;
            break;
        }
        let a: number = 0;
        let b: number = 0;
        if (error.linePos) {
          a = error.linePos[0].line;
          if (error.linePos[1]) {
            b = error.linePos[1].line;
          }
        }
        rangeTree.insert([a, b], {
          message: error.message,
          range: range || Range.create(0, 0, 0, 0),
          severity: severity,
          source: "Ansible [YAML]",
        });
      }
    });
  });
  rangeTree.forEach((range, diag) => {
    diagnostics.push(diag);
  });

  return diagnostics;
}
