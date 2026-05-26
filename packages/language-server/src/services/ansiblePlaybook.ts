import { URI } from "vscode-uri";
import {
  Connection,
  Diagnostic,
  DiagnosticSeverity,
  integer,
  Range,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getCommandService } from "@ansible/core/out/services/CommandService";
import type { WorkspaceFolderContext } from "./workspaceManager";

export class AnsiblePlaybook {
  private connection: Connection;
  private context: WorkspaceFolderContext;
  private useProgressTracker = false;

  constructor(connection: Connection, context: WorkspaceFolderContext) {
    this.connection = connection;
    this.context = context;
    this.useProgressTracker =
      !!context.clientCapabilities.window?.workDoneProgress;
  }

  public async doValidate(
    textDocument: TextDocument,
  ): Promise<Map<string, Diagnostic[]>> {
    const docPath = URI.parse(textDocument.uri).path;
    let diagnostics = new Map<string, Diagnostic[]>();

    const progressTracker = this.useProgressTracker
      ? await this.connection.window.createWorkDoneProgress()
      : { begin: () => {}, done: () => {} };

    const workingDirectory = URI.parse(this.context.workspaceFolder.uri).path;

    progressTracker.begin(
      "ansible syntax-check",
      undefined,
      "Processing files...",
    );

    const commandService = getCommandService();

    try {
      const result = await commandService.runTool(
        "ansible-playbook",
        [docPath, "--syntax-check"],
        { cwd: workingDirectory },
      );

      if (result.exitCode !== 0 && result.stderr) {
        const regex =
          /The error appears to be in '(?<filename>.*)': line (?<line>\d+), column (?<column>\d+)/;
        const match = regex.exec(result.stderr);
        diagnostics =
          match?.groups
            ? this.processReport(
                result.stderr,
                match.groups.filename,
                parseInt(match.groups.line),
                parseInt(match.groups.column),
              )
            : this.processReport(result.stderr, docPath, 1, 1);
      }
    } catch (error) {
      this.connection.console.error(
        `Exception in AnsiblePlaybook service: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      );
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
    const diagnostics = new Map<string, Diagnostic[]>();
    if (!result) return diagnostics;

    const range: Range = {
      start: { line: line - 1, character: column - 1 },
      end: { line: line - 1, character: integer.MAX_VALUE },
    };

    const locationUri = URI.file(fileName).toString();
    diagnostics.set(locationUri, [
      {
        message: result,
        range,
        severity: DiagnosticSeverity.Error,
        source: "Ansible",
      },
    ]);

    return diagnostics;
  }
}
