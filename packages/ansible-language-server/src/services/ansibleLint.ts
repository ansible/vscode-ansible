import { ExecException } from "child_process";
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
import { fileExists } from "../utils/misc";
import { WorkspaceFolderContext } from "./workspaceManager";
import { CommandRunner } from "../utils/commandRunner";

/**
 * Acts as and interface to ansible-lint and a cache of its output.
 *
 * ansible-lint may provide diagnostics for more than just the file for which
 * linting was triggered, and this is reflected in the implementation.
 */
export class AnsibleLint {
  private connection: Connection;
  private context: WorkspaceFolderContext;
  private useProgressTracker = false;
  private _ansibleLintConfigFilePath: string | undefined = undefined;

  constructor(connection: Connection, context: WorkspaceFolderContext) {
    this.connection = connection;
    this.context = context;
    this.useProgressTracker =
      !!context.clientCapabilities.window?.workDoneProgress;
  }

  /**
   * Perform linting for the given document.
   *
   * In case no errors are found for the current document, and linting has been
   * performed on opening the document, then only the cache is cleared, and not
   * the diagnostics on the client side. That way old diagnostics will persist
   * until the file is changed. This allows inspecting more complex errors
   * reported in other files.
   */
  public async doValidate(
    textDocument: TextDocument,
  ): Promise<Map<string, Diagnostic[]>> {
    let diagnostics: Map<string, Diagnostic[]> = new Map();

    const workingDirectory = URI.parse(this.context.workspaceFolder.uri).path;
    const mountPaths = new Set([workingDirectory]);
    const settings = await this.context.documentSettings.get(textDocument.uri);

    let linterArguments = settings.validation.lint.arguments ?? "";

    // Determine linter config file
    let ansibleLintConfigPath = linterArguments.match(
      /(?:^|\s)-c\s*(?<sep>[\s'"])(?<conf>.+?)(?:\k<sep>|$)/,
    )?.groups?.conf;
    if (!ansibleLintConfigPath) {
      // Config file not provided in arguments -> search for one mimicking the
      // way ansible-lint looks for it, going up the directory structure
      const ansibleLintConfigFile = await this.findAnsibleLintConfigFile(
        textDocument.uri,
      );
      if (ansibleLintConfigFile) {
        ansibleLintConfigPath = URI.parse(ansibleLintConfigFile).path;
        linterArguments = `${linterArguments} -c "${ansibleLintConfigPath}"`;
        mountPaths.add(path.dirname(ansibleLintConfigPath));
      }
    }

    this._ansibleLintConfigFilePath = ansibleLintConfigPath;
    linterArguments = `${linterArguments} --offline --nocolor -f codeclimate`;

    const docPath = URI.parse(textDocument.uri).path;
    mountPaths.add(path.dirname(docPath));

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

    progressTracker.begin("ansible-lint", undefined, "Processing files...");

    const commandRunner = new CommandRunner(
      this.connection,
      this.context,
      settings,
    );

    try {
      // get ansible-lint result on the doc
      const result = await commandRunner.runCommand(
        "ansible-lint",
        `${linterArguments} "${docPath}"`,
        workingDirectory,
        mountPaths,
      );

      diagnostics = this.processReport(result.stdout, workingDirectory);

      if (result.stderr) {
        this.connection.console.info(`[ansible-lint] ${result.stderr}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        const execError = error as ExecException & {
          // according to the docs, these are always available
          stdout: string;
          stderr: string;
        };

        if (execError.stdout) {
          diagnostics = this.processReport(execError.stdout, workingDirectory);
        } else {
          if (execError.stderr) {
            this.connection.console.info(`[ansible-lint] ${execError.stderr}`);
          }

          progressTracker.done();
          this.connection.window.showErrorMessage(execError.message);
          return new Map();
        }
      } else {
        const exceptionString = `Exception in AnsibleLint service: ${JSON.stringify(
          error,
        )}`;

        progressTracker.done();
        this.connection.console.error(exceptionString);
        this.connection.window.showErrorMessage(exceptionString);
        return new Map();
      }
    }

    progressTracker.done();
    return diagnostics;
  }

  private processReport(
    result: string,
    workingDirectory: string,
  ): Map<string, Diagnostic[]> {
    const diagnostics: Map<string, Diagnostic[]> = new Map();
    if (!result) {
      this.connection.console.warn(
        "Standard output from ansible-lint is suspiciously empty.",
      );
      return diagnostics;
    }
    try {
      const report = JSON.parse(result);
      if (report instanceof Array) {
        for (const item of report) {
          if (
            typeof item.check_name === "string" &&
            item.location &&
            typeof item.location.path === "string" &&
            ((item.location.positions && item.location.positions.begin) ||
              (item.location.lines &&
                (item.location.lines.begin ||
                  typeof item.location.lines.begin === "number")))
          ) {
            const begin_line = item.location.positions
              ? item.location.positions.begin.line
              : item.location.lines.begin.line ||
                item.location.lines.begin ||
                1;
            const begin_column = item.location.positions
              ? item.location.positions.begin.column
              : item.location.lines.begin.column || 1;
            const start: Position = {
              line: begin_line - 1,
              character: begin_column - 1,
            };
            const end: Position = {
              line: begin_line - 1,
              character: integer.MAX_VALUE,
            };
            const range: Range = {
              start: start,
              end: end,
            };

            let severity: DiagnosticSeverity = DiagnosticSeverity.Error;
            if (item.severity) {
              if (item.severity === "major") {
                severity = DiagnosticSeverity.Error;
              } else if (item.severity === "minor") {
                severity = DiagnosticSeverity.Warning;
              }
            }

            const path = `${workingDirectory}/${item.location.path}`;
            const locationUri = URI.file(path).toString();

            const helpUri: string = item.url ? item.url : undefined;
            const helpUrlName: string = helpUri ? item.check_name : undefined;

            let fileDiagnostics = diagnostics.get(locationUri);
            if (!fileDiagnostics) {
              fileDiagnostics = [];
              diagnostics.set(locationUri, fileDiagnostics);
            }
            let message: string = item.check_name;
            if (item.description) {
              message = item.description;
            }
            fileDiagnostics.push({
              message: message,
              range: range || Range.create(0, 0, 0, 0),
              severity: severity,
              source: "ansible-lint",
              code: helpUrlName,
              codeDescription: { href: helpUri },
            });
          }
        }
      }
    } catch (error) {
      this.connection.window.showErrorMessage(
        "Could not parse ansible-lint output. Please check your ansible-lint installation & configuration." +
          " More info in `Ansible Server` output.",
      );
      let message: string;
      if (error instanceof Error) {
        message = error.message;
      } else {
        message = JSON.stringify(error);
      }
      this.connection.console.error(
        `Exception while parsing ansible-lint output: ${message}` +
          `\nTried to parse the following:\n${result}`,
      );
    }
    return diagnostics;
  }

  private async findAnsibleLintConfigFile(
    uri: string,
  ): Promise<string | undefined> {
    // find configuration path
    let configPath;
    const pathArray = uri.split("/");

    // Find first configuration file going up until workspace root
    for (let index = pathArray.length - 1; index >= 0; index--) {
      let candidatePath = pathArray
        .slice(0, index)
        .concat(".ansible-lint")
        .join("/");

      const workspacePath = URI.parse(this.context.workspaceFolder.uri).path;
      candidatePath = URI.parse(candidatePath).path;

      if (!candidatePath.startsWith(workspacePath)) {
        // we've gone out of the workspace folder
        break;
      }
      if (await fileExists(candidatePath)) {
        configPath = URI.parse(candidatePath).path;
        break;
      }
    }
    return configPath;
  }

  get ansibleLintConfigFilePath(): string | undefined {
    return this._ansibleLintConfigFilePath;
  }
}
