import * as child_process from "child_process";
import * as path from "path";
import { URI } from "vscode-uri";
import {
  Connection,
  Diagnostic,
  DiagnosticSeverity,
  integer,
  Position,
  Range,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { WorkspaceFolderContext } from "./workspaceManager";
import { CommandRunner } from "../utils/commandRunner";

/**
 * Acts as an interface to ansible-playbook command.
 */
export class AnsiblePlaybook {
  private useProgressTracker = false;

  /**
   *
   * @param connection - establishes connection with the client
   * @param context - provides workspace context of the client
   */

  constructor(
    private connection: Connection,
    private context: WorkspaceFolderContext,
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
    textDocument: TextDocument,
  ): Promise<Map<string, Diagnostic[]>> {
    const docPath = URI.parse(textDocument.uri).path;
    let diagnostics: Map<string, Diagnostic[]> = new Map();
    const progressTracker = this.useProgressTracker
      ? await this.connection.window.createWorkDoneProgress()
      : {
          begin: () => {
            // do nothing
          },
          done: () => {
            // do nothing
          },
        };

    const workingDirectory = URI.parse(this.context.workspaceFolder.uri).path;
    const mountPaths = new Set([workingDirectory, path.dirname(docPath)]);
    const settings = await this.context.documentSettings.get(textDocument.uri);

    progressTracker.begin(
      "ansible syntax-check",
      undefined,
      "Processing files...",
    );

    const commandRunner = new CommandRunner(
      this.connection,
      this.context,
      settings,
    );
    try {
      // run ansible playbook syntax-check
      await commandRunner.runCommand(
        "ansible-playbook",
        `${docPath} --syntax-check`,
        workingDirectory,
        mountPaths,
      );
    } catch (error) {
      if (error instanceof Error) {
        const execError = error as child_process.ExecException & {
          // according to the docs, these are always available
          stdout: string;
          stderr: string;
        };

        // This is the regex to extract the filename, line and column number from the stderr produced by syntax-check command
        const ansibleSyntaxCheckRegex =
          /The error appears to be in '(?<filename>.*)': line (?<line>\d+), column (?<column>\d+)/;

        const filteredErrorMessage = ansibleSyntaxCheckRegex.exec(
          execError.stderr,
        );

        diagnostics =
          filteredErrorMessage && filteredErrorMessage.groups
            ? this.processReport(
                execError.message,
                filteredErrorMessage.groups.filename,
                parseInt(filteredErrorMessage.groups.line),
                parseInt(filteredErrorMessage.groups.column),
              )
            : this.processReport(execError.message, docPath, 1, 1);

        if (execError.stderr) {
          this.connection.console.info(
            `[ansible syntax-check] ${execError.stderr}`,
          );
        }
      } else {
        this.connection.console.error(
          `Exception in AnsibleSyntaxCheck service: ${JSON.stringify(error)}`,
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
    column: number,
  ): Map<string, Diagnostic[]> {
    const diagnostics: Map<string, Diagnostic[]> = new Map();
    if (!result) {
      this.connection.console.warn(
        "Standard output from ansible syntax-check is suspiciously empty.",
      );
      return diagnostics;
    }
    const start: Position = {
      line: line - 1,
      character: column - 1,
    };
    const end: Position = {
      line: line - 1,
      character: integer.MAX_VALUE,
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
      source: "Ansible",
    });

    diagnostics.set(locationUri, fileDiagnostics);
    return diagnostics;
  }
}
