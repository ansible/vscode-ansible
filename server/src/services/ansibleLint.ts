import * as child_process from 'child_process';
import { ExecException } from 'node:child_process';
import { URL } from 'url';
import { promisify } from 'util';
import {
  Connection,
  Diagnostic,
  DiagnosticSeverity,
  Position,
  Range,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
const exec = promisify(child_process.exec);

export class AnsibleLint {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  public async doValidate(
    textDocument: TextDocument
  ): Promise<Map<string, Diagnostic[]>> {
    const docPath = new URL(textDocument.uri).pathname;
    let diagnostics: Map<string, Diagnostic[]> = new Map();
    try {
      const result = await exec(
        `ansible-lint --offline --nocolor -f codeclimate ${docPath}`,
        {
          encoding: 'utf-8',
        }
      );
      diagnostics = this.processReport(result, textDocument);

      if (result.stderr) {
        this.connection.console.warn(result.stderr);
      }
    } catch (error) {
      const execError = error as ExecException & StdResult;
      if (execError.code === 2) {
        diagnostics = this.processReport(
          {
            stdout: execError.stdout,
            stderr: execError.stderr,
          },
          textDocument
        );
      } else {
        this.connection.console.error(error.message);
      }
    }

    return diagnostics;
  }

  private processReport(
    result: StdResult,
    textDocument: TextDocument
  ): Map<string, Diagnostic[]> {
    const diagnostics: Map<string, Diagnostic[]> = new Map();
    const report = JSON.parse(result.stdout);
    if (report instanceof Array) {
      for (const item of report) {
        if (
          typeof item.check_name === 'string' &&
          item.location &&
          typeof item.location.path === 'string' &&
          item.location.lines &&
          item.location.lines.begin
        ) {
          const begin_line =
            item.location.lines.begin || item.location.lines.begin.line || 1;
          const begin_column = item.location.lines.begin.column || 1;
          const start: Position = {
            line: begin_line - 1,
            character: begin_column - 1,
          };
          const end: Position = {
            line: begin_line - 1,
            character: Number.MAX_SAFE_INTEGER,
          };
          const range: Range = {
            start: start,
            end: end,
          };
          if (!diagnostics.has(textDocument.uri)) {
            diagnostics.set(textDocument.uri, []);
          }
          const fileDiagnostics = diagnostics.get(
            textDocument.uri
          ) as Diagnostic[];

          fileDiagnostics.push({
            message: item.check_name,
            range: range || Range.create(0, 0, 0, 0),
            severity: DiagnosticSeverity.Error,
            source: 'Ansible [YAML]',
          });
        }
      }
    }
    return diagnostics;
  }
}

interface StdResult {
  stdout: string;
  stderr: string;
}
