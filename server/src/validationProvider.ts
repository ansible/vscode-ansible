import IntervalTree from '@flatten-js/interval-tree';
import {
  Diagnostic,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  Location,
  Range,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseAllDocuments } from 'yaml';
import * as _ from 'lodash';

export function doValidate(textDocument: TextDocument): Diagnostic[] {
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
        const start = textDocument.positionAt(errorRange.start);
        const end = textDocument.positionAt(errorRange.end);
        range = Range.create(start, end);

        let severity;
        switch (error.name) {
          case 'YAMLReferenceError':
          case 'YAMLSemanticError':
          case 'YAMLSyntaxError':
            severity = DiagnosticSeverity.Error;
            break;
          case 'YAMLWarning':
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
          source: 'Ansible [YAML]',
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
            'the scope of this error ends here'
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
