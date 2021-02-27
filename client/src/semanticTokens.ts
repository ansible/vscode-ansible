import { performance } from 'perf_hooks';
import * as vscode from 'vscode';
import { parseAllDocuments } from 'yaml';
import { Node, Scalar, YAMLMap, YAMLSeq } from 'yaml/types';

const keywords = new Set([
  'action',
  'always',
  'any_errors_fatal',
  'args',
  'async',
  'become',
  'become_exe',
  'become_flags',
  'become_method',
  'become_user',
  'block',
  'changed_when',
  'check_mode',
  'collections',
  'connection',
  'debugger',
  'delay',
  'delegate_facts',
  'delegate_to',
  'diff',
  'environment',
  'extended',
  'fact_path',
  'failed_when',
  'force_handlers',
  'gather_facts',
  'gather_subset',
  'gather_timeout',
  'handlers',
  'hosts',
  'ignore_errors',
  'ignore_unreachable',
  'label',
  'local_action',
  'loop',
  'loop_control',
  'max_fail_percentage',
  'module_defaults',
  'name',
  'no_log',
  'notify',
  'order',
  'pause',
  'poll',
  'port',
  'post_tasks',
  'pre_tasks',
  'register',
  'remote_user',
  'rescue',
  'retries',
  'roles',
  'run_once',
  'serial',
  'strategy',
  'tags',
  'tasks',
  'throttle',
  'timeout',
  'until',
  'vars',
  'vars_files',
  'vars_prompt',
  'when',
]);

const withKeywords = /^with_[a-z_]+$/;

const tokenTypes = ['method'];

const tokenModifiers = ['defaultLibrary'];

export const legend = new vscode.SemanticTokensLegend(
  tokenTypes,
  tokenModifiers
);

// Makes Ansible keyword tags distinct from other tags
export class DocumentSemanticTokensProvider
  implements vscode.DocumentSemanticTokensProvider {
  async provideDocumentSemanticTokens(
    document: vscode.TextDocument
  ): Promise<vscode.SemanticTokens> {
    const builder = new vscode.SemanticTokensBuilder(legend);
    const start = performance.now();
    const yDocuments = parseAllDocuments(document.getText());
    yDocuments.forEach((yDoc) => {
      this._markKeywords(yDoc.contents, builder, document);
    });
    const stop = performance.now();
    return builder.build();
  }

  private _markKeywords(
    node: Node | null,
    builder: vscode.SemanticTokensBuilder,
    document: vscode.TextDocument,
    context: Node[] = []
  ) {
    if (node instanceof YAMLMap) {
      node.items.forEach((pair) => {
        const key: Node | null = pair.key;
        if (
          key instanceof Scalar &&
          (keywords.has(key.value) || withKeywords.test(key.value))
        ) {
          const parent = context[context.length - 1];
          if (parent && parent instanceof YAMLSeq && key.range) {
            const startPosition = document.positionAt(key.range[0]);
            const length = key.range[1] - key.range[0];
            const endPosition = startPosition.translate(0, length);
            const range = new vscode.Range(startPosition, endPosition);
            builder.push(range, 'method', ['defaultLibrary']);
          }
        }
        this._markKeywords(pair.value, builder, document, context.concat(node));
      });
    } else if (node instanceof YAMLSeq) {
      node.items.forEach((item: Node | null) =>
        this._markKeywords(item, builder, document, context.concat(node))
      );
    }
  }
}
