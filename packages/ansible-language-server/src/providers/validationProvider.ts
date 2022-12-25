import IntervalTree from "@flatten-js/interval-tree";
import * as _ from "lodash";
import {
  Connection,
  Diagnostic,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  Location,
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
  let diagnosticsByFile;
  if (quick || !context) {
    // get validation from cache
    diagnosticsByFile =
      validationManager.getValidationFromCache(textDocument.uri) ||
      new Map<string, Diagnostic[]>();
  } else {
    // full validation with ansible-lint or ansible syntax-check (if ansible-lint is not installed or disabled)

    const settings = await context.documentSettings.get(textDocument.uri);
    if (!settings.validation.enabled) {
      console.log("Validation disabled");

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
      const lintAvailability = await commandRunner.getExecutablePath(
        lintExecutable,
      );
      console.debug("Path for lint: ", lintAvailability);

      if (lintAvailability) {
        console.debug("Validating using ansible-lint");
        diagnosticsByFile = await context.ansibleLint.doValidate(textDocument);
      } else {
        connection?.window.showErrorMessage(
          "Ansible-lint is not available. Kindly check the path or disable validation using ansible-lint",
        );
      }
    }

    // validate using ansible-playbook --syntax-check
    else {
      console.debug("Validating using ansible syntax-check");

      if (isPlaybook(textDocument)) {
        console.debug("playbook file");
        diagnosticsByFile = await context.ansiblePlaybook.doValidate(
          textDocument,
        );
      } else {
        console.debug("non-playbook file");
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
  const yDocuments = parseAllDocuments(textDocument.getText(), {
    prettyErrors: false,
  });
  const rangeTree = new IntervalTree<Diagnostic>();
  yDocuments.forEach((yDoc) => {
    yDoc.errors.forEach((error) => {
      const errorRange = error.range || error.source?.range;
      let range;
      if (errorRange) {
        const start = textDocument.positionAt(
          errorRange.origStart !== undefined
            ? errorRange.origStart
            : errorRange.start,
        );
        const end = textDocument.positionAt(
          errorRange.origEnd !== undefined
            ? errorRange.origEnd
            : errorRange.end,
        );
        range = Range.create(start, end);

        let severity;
        switch (error.name) {
          case "YAMLReferenceError":
          case "YAMLSemanticError":
          case "YAMLSyntaxError":
            severity = DiagnosticSeverity.Error;
            break;
          case "YAMLWarning":
            severity = DiagnosticSeverity.Warning;
            break;
          default:
            severity = DiagnosticSeverity.Information;
            break;
        }
        rangeTree.insert([errorRange.start, errorRange.end], {
          message: error.message,
          range: range || Range.create(0, 0, 0, 0),
          severity: severity,
          source: "Ansible [YAML]",
        });
      }
    });
  });
  rangeTree.forEach((range, diag) => {
    const searchResult = rangeTree.search(range);
    if (searchResult) {
      const allRangesAreEqual = searchResult.every((foundDiag: Diagnostic) => {
        // (range start == range end) in case it has already been collapsed
        return (
          foundDiag.range.start === foundDiag.range.end ||
          _.isEqual(foundDiag.range, diag.range)
        );
      });
      if (!allRangesAreEqual) {
        // Prevent large error scopes hiding/obscuring other error scopes
        // In YAML this is very common in case of syntax errors
        const range = diag.range;
        diag.relatedInformation = [
          DiagnosticRelatedInformation.create(
            Location.create(textDocument.uri, {
              start: range.end,
              end: range.end,
            }),
            "the scope of this error ends here",
          ),
        ];
        // collapse the range
        diag.range = {
          start: range.start,
          end: range.start,
        };
      }
    }
    diagnostics.push(diag);
  });

  return diagnostics;
}
