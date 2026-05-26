import * as path from "path";
import { URI } from "vscode-uri";
import {
  Connection,
  Diagnostic,
  DiagnosticSeverity,
  integer,
  Range,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { fileExists } from "../utils/misc";
import { getCommandService } from "@ansible/core/out/services/CommandService";
import type { WorkspaceFolderContext } from "./workspaceManager";

export class AnsibleLint {
  private connection: Connection;
  private context: WorkspaceFolderContext;
  private useProgressTracker = false;
  private _ansibleLintConfigFilePath: string | undefined;

  constructor(connection: Connection, context: WorkspaceFolderContext) {
    this.connection = connection;
    this.context = context;
    this.useProgressTracker =
      !!context.clientCapabilities.window?.workDoneProgress;
  }

  public async doValidate(
    textDocument: TextDocument,
  ): Promise<Map<string, Diagnostic[]>> {
    let diagnostics = new Map<string, Diagnostic[]>();

    const workingDirectory = URI.parse(this.context.workspaceFolder.uri).path;
    const settings = await this.context.documentSettings.get(textDocument.uri);

    if (!settings.validation?.enabled) {
      return diagnostics;
    }

    let linterArguments = settings.validation.lint.arguments ?? "";

    let ansibleLintConfigPath = linterArguments.match(
      /(?:^|\s)-c\s*(?<sep>[\s'"])(?<conf>.+?)(?:\k<sep>|$)/,
    )?.groups?.conf;

    if (!ansibleLintConfigPath) {
      const configFile = await this.findAnsibleLintConfigFile(textDocument.uri);
      if (configFile) {
        ansibleLintConfigPath = URI.parse(configFile).path;
        linterArguments = `${linterArguments} -c "${ansibleLintConfigPath}"`;
      }
    }

    this._ansibleLintConfigFilePath = ansibleLintConfigPath;
    linterArguments = `${linterArguments} --offline --nocolor -f codeclimate`;

    if (settings.validation.lint.autoFixOnSave) {
      linterArguments = `${linterArguments} --fix`;
    }

    const docPath = URI.parse(textDocument.uri).path;

    const progressTracker = this.useProgressTracker
      ? await this.connection.window.createWorkDoneProgress()
      : { begin: () => {}, done: () => {} };

    progressTracker.begin("ansible-lint", undefined, "Processing files...");

    const commandService = getCommandService();

    try {
      const result = await commandService.runTool(
        "ansible-lint",
        [...parseArgv(linterArguments), docPath],
        { cwd: workingDirectory },
      );

      diagnostics = this.processReport(result.stdout, workingDirectory);

      if (result.stderr) {
        this.connection.console.info(`[ansible-lint] ${result.stderr}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        this.connection.console.error(
          `Exception in AnsibleLint service: ${error.message}`,
        );
      }
    }

    progressTracker.done();
    return diagnostics;
  }

  private processReport(
    result: string,
    workingDirectory: string,
  ): Map<string, Diagnostic[]> {
    const diagnostics = new Map<string, Diagnostic[]>();
    if (!result) {
      this.connection.console.warn(
        "Standard output from ansible-lint is suspiciously empty.",
      );
      return diagnostics;
    }

    try {
      const report = JSON.parse(result);
      if (!Array.isArray(report)) return diagnostics;

      for (const item of report) {
        if (
          typeof item.check_name !== "string" ||
          !item.location ||
          typeof item.location.path !== "string"
        ) {
          continue;
        }

        const hasPosition =
          item.location.positions?.begin ||
          item.location.lines?.begin !== undefined;
        if (!hasPosition) continue;

        const beginLine = item.location.positions
          ? item.location.positions.begin.line
          : item.location.lines.begin.line ||
            item.location.lines.begin ||
            1;
        const beginColumn = item.location.positions
          ? item.location.positions.begin.column
          : item.location.lines.begin.column || 1;

        const range: Range = {
          start: { line: beginLine - 1, character: beginColumn - 1 },
          end: { line: beginLine - 1, character: integer.MAX_VALUE },
        };

        let severity: DiagnosticSeverity = DiagnosticSeverity.Error;
        if (item.severity === "minor") {
          severity = DiagnosticSeverity.Warning;
        }

        const filePath = `${workingDirectory}/${item.location.path}`;
        const locationUri = URI.file(filePath).toString();

        const helpUri: string | undefined = item.url || undefined;
        const helpUrlName: string | undefined = helpUri
          ? item.check_name
          : undefined;

        let fileDiagnostics = diagnostics.get(locationUri);
        if (!fileDiagnostics) {
          fileDiagnostics = [];
          diagnostics.set(locationUri, fileDiagnostics);
        }

        fileDiagnostics.push({
          message: item.description || item.check_name,
          range,
          severity,
          source: "ansible-lint",
          code: helpUrlName,
          codeDescription: helpUri ? { href: helpUri } : undefined,
        });
      }
    } catch (error) {
      this.connection.window.showErrorMessage(
        "Could not parse ansible-lint output. Check your ansible-lint installation.",
      );
      this.connection.console.error(
        `Exception while parsing ansible-lint output: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      );
    }

    return diagnostics;
  }

  private async findAnsibleLintConfigFile(
    uri: string,
  ): Promise<string | undefined> {
    const workspacePath = URI.parse(this.context.workspaceFolder.uri).path;
    let dir = path.dirname(URI.parse(uri).path);

    while (dir.startsWith(workspacePath)) {
      const candidate = path.join(dir, ".ansible-lint");
      if (await fileExists(candidate)) {
        return candidate;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return undefined;
  }

  get ansibleLintConfigFilePath(): string | undefined {
    return this._ansibleLintConfigFilePath;
  }
}

/**
 * Splits a shell-like argument string, respecting single and double quotes.
 */
function parseArgv(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote = "";

  for (const ch of input) {
    if (quote) {
      if (ch === quote) {
        quote = "";
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}
