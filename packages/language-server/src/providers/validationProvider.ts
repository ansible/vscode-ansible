import { IntervalTree, IntervalBase } from "@flatten-js/interval-tree";
import {
  Connection,
  Diagnostic,
  DiagnosticSeverity,
  Range,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ValidationManager } from "../services/validationManager";
import type { WorkspaceFolderContext } from "../services/workspaceManager";
import { isPlaybook, parseAllDocuments } from "../utils/yaml";
import { getCommandService } from "@ansible/core/out/services/CommandService";

export async function doValidate(
  textDocument: TextDocument,
  validationManager: ValidationManager,
  quick = true,
  context?: WorkspaceFolderContext,
  connection?: Connection,
): Promise<Map<string, Diagnostic[]>> {
  let diagnosticsByFile = new Map<string, Diagnostic[]>();

  if (quick || !context) {
    diagnosticsByFile =
      validationManager.getValidationFromCache(textDocument.uri) ||
      new Map<string, Diagnostic[]>();
  } else {
    const settings = await context.documentSettings.get(textDocument.uri);

    if (!settings.validation.enabled) {
      connection?.console.log("Validation disabled");
      const blankDiagnostics = new Map<string, Diagnostic[]>();
      blankDiagnostics.set(textDocument.uri, []);
      validationManager.processDiagnostics(textDocument.uri, blankDiagnostics);
      validationManager.cacheDiagnostics(textDocument.uri, blankDiagnostics);
      return blankDiagnostics;
    }

    if (settings.validation.lint.enabled) {
      const commandService = getCommandService();
      const lintPath = await commandService.getToolPath(
        settings.validation.lint.path,
      );
      connection?.console.log(`Path for lint: ${lintPath}`);

      if (lintPath) {
        connection?.console.log("Validating using ansible-lint");
        diagnosticsByFile = await context.ansibleLint.doValidate(textDocument);
      } else {
        connection?.window.showErrorMessage(
          "Ansible-lint is not available. Check the path or disable lint validation.",
        );
      }
    } else {
      connection?.console.log("Validating using ansible syntax-check");
      if (isPlaybook(textDocument)) {
        diagnosticsByFile =
          await context.ansiblePlaybook.doValidate(textDocument);
      } else {
        diagnosticsByFile = new Map<string, Diagnostic[]>();
      }
    }

    if (!diagnosticsByFile.has(textDocument.uri)) {
      diagnosticsByFile.set(textDocument.uri, []);
    }
    validationManager.cacheDiagnostics(textDocument.uri, diagnosticsByFile);
  }

  const settings = await context?.documentSettings.get(textDocument.uri);
  if (settings?.validation.enabled) {
    for (const [fileUri, fileDiagnostics] of diagnosticsByFile) {
      if (textDocument.uri === fileUri) {
        fileDiagnostics.push(...getYamlValidation(textDocument));
      }
    }
  }

  validationManager.processDiagnostics(textDocument.uri, diagnosticsByFile);
  return diagnosticsByFile;
}

export function getYamlValidation(textDocument: TextDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const yDocuments = parseAllDocuments(textDocument.getText());
  const rangeTree = new IntervalTree<Diagnostic>();

  for (const yDoc of yDocuments) {
    for (const error of yDoc.errors) {
      const [errStart, errEnd] = error.pos;
      if (errStart !== undefined && errEnd !== undefined) {
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

        let a = 0;
        let b = 0;
        if (error.linePos) {
          a = error.linePos[0].line;
          if (error.linePos[1]) {
            b = error.linePos[1].line;
          }
        }

        rangeTree.insert([a, b], {
          message: error.message,
          range: range || Range.create(0, 0, 0, 0),
          severity,
          source: "Ansible [YAML]",
        });
      }
    }
  }

  rangeTree.forEach((_range: IntervalBase, diag: Diagnostic) => {
    diagnostics.push(diag);
  });

  return diagnostics;
}
