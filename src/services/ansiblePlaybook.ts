import * as child_process from 'child_process';
import { URI } from 'vscode-uri';
import { promisify } from 'util';
import {
  Connection,
  Diagnostic,
  DiagnosticSeverity,
  Position,
  Range,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { withInterpreter } from '../utils/misc';
import { WorkspaceFolderContext } from './workspaceManager';

const exec = promisify(child_process.exec);

/**
 * Acts as an interface to ansible-playbook command.
 */
export class AnsiblePlaybook {
  private useProgressTracker = false;

  /**
   *
   * @param connection establishes connection with the client
   * @param context provides workspace context of the client
   */

  constructor(
    private connection: Connection,
    private context: WorkspaceFolderContext
  ) {
    this.useProgressTracker =
      !!context.clientCapabilities.window?.workDoneProgress;
  }

  /**
   * Acts as an interface to ansible-playbook <file> --syntax-check command and a cache of its output.
   * ansible syntax-check may provide diagnostics for more than just the file for which
   * it was triggered, and this is reflected in the implementation.
   *
   * Perform ansible syntax-check for the given document.
   */
  public async doValidate(
    textDocument: TextDocument
  ): Promise<Map<string, Diagnostic[]>> {
    const docPath = URI.parse(textDocument.uri).path;
    let diagnostics: Map<string, Diagnostic[]> = new Map();
    const progressTracker = this.useProgressTracker
      ? await this.connection.window.createWorkDoneProgress()
      : {
          begin: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
          done: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
        };

    const workingDirectory = URI.parse(this.context.workspaceFolder.uri).path;

    const settings = await this.context.documentSettings.get(textDocument.uri);

    progressTracker.begin(
      'ansible syntax-check',
      undefined,
      'Processing files...'
    );

    const [command, env] = withInterpreter(
      `${settings.ansible.path}-playbook`,
      `${docPath} --syntax-check`,
      settings.python.interpreterPath,
      settings.python.activationScript
    );

    try {
      await exec(command, {
        encoding: 'utf-8',
        cwd: workingDirectory,
        env: env,
      });
    } catch (error) {
      if (error instanceof Error) {
        const execError = error as child_process.ExecException & {
          // according to the docs, these are always available
          stdout: string;
          stderr: string;
        };

        // This is the regex to extract the filename, line and column number from the strerr produced by syntax-check command
        const ansibleSyntaxCheckRegex =
          /The error appears to be in '(?<filename>.*)': line (?<line>\d+), column (?<column>\d+)/;

        const filteredErrorMessage = ansibleSyntaxCheckRegex.exec(execError.stderr);

        diagnostics = filteredErrorMessage
          ? this.processReport(
              execError.message,
              filteredErrorMessage.groups.filename,
              parseInt(filteredErrorMessage.groups.line),
              parseInt(filteredErrorMessage.groups.column)
            )
          : this.processReport(execError.message, docPath, 1, 1);

        if (execError.stderr) {
          this.connection.console.info(
            `[ansible syntax-check] ${execError.stderr}`
          );
        }
      } else {
        this.connection.console.error(
          `Exception in AnsibleSyntaxCheck service: ${JSON.stringify(error)}`
        );
      }
    }

    progressTracker.done();
    return diagnostics;
  }

  private processReport(
    result: string,
    fileName: string,
    line: number,
    column: number
  ): Map<string, Diagnostic[]> {
    const diagnostics: Map<string, Diagnostic[]> = new Map();
    if (!result) {
      this.connection.console.warn(
        'Standard output from ansible syntax-check is suspiciously empty.'
      );
      return diagnostics;
    }
    const start: Position = {
      line: line - 1,
      character: column - 1,
    };
    const end: Position = {
      line: line - 1,
      character: Number.MAX_SAFE_INTEGER,
    };
    const range: Range = {
      start,
      end,
    };

    const severity: DiagnosticSeverity = DiagnosticSeverity.Error;

    const locationUri = `file://${fileName}`;

    const fileDiagnostics = diagnostics.get(locationUri) || [];

    fileDiagnostics.push({
      message: result,
      range,
      severity,
      source: 'Ansible',
    });

    diagnostics.set(locationUri, fileDiagnostics);
    return diagnostics;
  }
}
