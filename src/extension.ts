import IntervalTree from '@flatten-js/interval-tree';
import { performance } from 'perf_hooks';
import * as vscode from 'vscode';
import { parseAllDocuments } from 'yaml';
import { Node, Scalar, YAMLMap, YAMLSeq } from 'yaml/types';

const tokenTypes = [
  'method'
];

const tokenModifiers = [
  'defaultLibrary'
];

const keywords = new Set([
  'action', 'always', 'any_errors_fatal', 'args', 'async', 'become', 'become_exe',
  'become_flags', 'become_method', 'become_user', 'block', 'changed_when',
  'check_mode', 'collections', 'connection', 'debugger', 'delay',
  'delegate_facts', 'delegate_to', 'diff', 'environment', 'extended', 'fact_path',
  'failed_when', 'force_handlers', 'gather_facts', 'gather_subset',
  'gather_timeout', 'handlers', 'hosts', 'ignore_errors', 'ignore_unreachable',
  'label', 'local_action', 'loop', 'loop_control', 'max_fail_percentage',
  'module_defaults', 'name', 'no_log', 'notify', 'order', 'pause', 'poll', 'port',
  'post_tasks', 'pre_tasks', 'register', 'remote_user', 'rescue', 'retries',
  'roles', 'run_once', 'serial', 'strategy', 'tags', 'tasks', 'throttle',
  'timeout', 'until', 'vars', 'vars_files', 'vars_prompt', 'when'
])

const with_keywords = /^with_[a-z_]+$/

const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);


export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider({ language: 'ansible' }, new DocumentSemanticTokensProvider(), legend));
  const collection = vscode.languages.createDiagnosticCollection('ansible');
  context.subscriptions.push(collection)

  if (vscode.window.activeTextEditor) {
    updateDiagnostics(vscode.window.activeTextEditor.document, collection);
  }
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      updateDiagnostics(editor.document, collection);
    }
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(editor => {
    updateDiagnostics(editor.document, collection);
  }));
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc => {
    updateDiagnostics(doc, collection);
  }));
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => {
    collection.delete(doc.uri);
  }));
}

function updateDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
  if (document && document.languageId === 'ansible') {
    const yDocuments = parseAllDocuments(document.getText(), { prettyErrors: false });
    const diagnostics: vscode.Diagnostic[] = []
    const rangeTree = new IntervalTree<vscode.Diagnostic>()
    yDocuments.forEach(yDoc => {
      yDoc.errors.forEach(error => {
        const errorRange = error.range || error.source?.range
        let range = undefined
        if (errorRange) {
          const start = document.positionAt(errorRange.start)
          const end = document.positionAt(errorRange.end)
          range = new vscode.Range(start, end)

          let severity = undefined
          switch (error.name) {
            case 'YAMLReferenceError':
            case 'YAMLSemanticError':
            case 'YAMLSyntaxError':
              severity = vscode.DiagnosticSeverity.Error
              break;
            case 'YAMLWarning':
              severity = vscode.DiagnosticSeverity.Warning
              break;
            default:
              severity = vscode.DiagnosticSeverity.Information
              break;
          }
          rangeTree.insert([errorRange.start, errorRange.end], {
            message: error.message,
            range: range || new vscode.Range(0, 0, 0, 0),
            severity: severity,
            source: 'Ansible [YAML]'
          })
        }
      })
    });
    rangeTree.forEach((range, diag) => {
      const searchResult = rangeTree.search(range);
      if (searchResult) {
        const allRangesAreEqual = searchResult.every((foundDiag: vscode.Diagnostic) => {
          // (range start == range end) in case it has already been collapsed
          return foundDiag.range.start == foundDiag.range.end || foundDiag.range.isEqual(diag.range);
        });
        if (!allRangesAreEqual) {
          // Prevent large error scopes hiding/obscuring other error scopes
          // In YAML this is very common in case of syntax errors
          const range = diag.range;
          diag.relatedInformation = [
            new vscode.DiagnosticRelatedInformation(
              new vscode.Location(document.uri, range.with(range.end, undefined)), `the scope of this error ends here`)
          ]
          // collapse the range
          diag.range = range.with(undefined, range.start)
        }
      }
      diagnostics.push(diag)
    });
    collection.set(document.uri, diagnostics);
  } else {
    collection.clear();
  }
}

interface IParsedToken {
  line: number;
  startCharacter: number;
  length: number;
  tokenType: string;
  tokenModifiers: string[];
}

// Makes Ansible keyword tags distinct from other tags
class DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
    const builder = new vscode.SemanticTokensBuilder(legend);
    const start = performance.now()
    const yDocuments = parseAllDocuments(document.getText());
    yDocuments.forEach(yDoc => {
      this._markKeywords(yDoc.contents, builder, document)
    });
    const stop = performance.now()
    return builder.build();
  }

  private _markKeywords(node: Node | null, builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument, context: Node[] = []) {
    if (node instanceof YAMLMap) {
      node.items.forEach(pair => {
        const key: Node | null = pair.key;
        if (key instanceof Scalar && (keywords.has(key.value) || with_keywords.test(key.value))) {
          const parent = context[context.length - 1]
          if (parent && parent instanceof YAMLSeq && key.range) {
            const startPosition = document.positionAt(key.range[0]);
            const length = key.range[1] - key.range[0]
            const endPosition = startPosition.translate(0, length);
            const range = new vscode.Range(startPosition, endPosition);
            builder.push(range, 'method', ['defaultLibrary'])
          }
        }
        this._markKeywords(pair.value, builder, document, context.concat(node))
      });
    } else if (node instanceof YAMLSeq) {
      node.items.forEach((item: Node | null) => this._markKeywords(item, builder, document, context.concat(node)));
    }
  }
}
