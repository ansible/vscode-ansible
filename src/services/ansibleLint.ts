import * as child_process from 'child_process';
import { ExecException } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';
import { promisify } from 'util';
import {
  Connection,
  Diagnostic,
  DiagnosticSeverity,
  DidChangeWatchedFilesParams,
  Position,
  Range,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseAllDocuments } from 'yaml';
import { IAnsibleLintConfig } from '../interfaces/ansibleLintConfig';
import { fileExists, hasOwnProperty, withInterpreter } from '../utils/misc';
import { WorkspaceFolderContext } from './workspaceManager';
const exec = promisify(child_process.exec);

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

  private configCache: Map<string, IAnsibleLintConfig> = new Map();

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
    textDocument: TextDocument
  ): Promise<Map<string, Diagnostic[]>> {
    let diagnostics: Map<string, Diagnostic[]> = new Map();

    const workingDirectory = URI.parse(this.context.workspaceFolder.uri).path;

    const settings = await this.context.documentSettings.get(textDocument.uri);

    if (settings.ansibleLint.enabled) {
      let linterArguments = settings.ansibleLint.arguments;

      // Determine linter config file
      let ansibleLintConfigPath = linterArguments.match(
        /(?:^|\s)-c\s*(?<sep>[\s'"])(?<conf>.+?)(?:\k<sep>|$)/
      )?.groups?.conf;
      if (!ansibleLintConfigPath) {
        // Config file not provided in arguments -> search for one mimicking the
        // way ansible-lint looks for it, going up the directory structure
        const ansibleLintConfigFile = await this.findAnsibleLintConfigFile(
          textDocument.uri
        );
        if (ansibleLintConfigFile) {
          ansibleLintConfigPath = URI.parse(ansibleLintConfigFile).path;
          linterArguments = `${linterArguments} -c "${ansibleLintConfigPath}"`;
        }
      }
      linterArguments = `${linterArguments} --offline --nocolor -f codeclimate`;

      const docPath = URI.parse(textDocument.uri).path;
      let progressTracker;
      if (this.useProgressTracker) {
        progressTracker = await this.connection.window.createWorkDoneProgress();
      }
      const ansibleLintConfigPromise = this.getAnsibleLintConfig(
        workingDirectory,
        ansibleLintConfigPath
      );

      try {
        if (progressTracker) {
          progressTracker.begin(
            'ansible-lint',
            undefined,
            'Processing files...'
          );
        }

        const [command, env] = withInterpreter(
          settings.ansibleLint.path,
          `${linterArguments} "${docPath}"`,
          settings.python.interpreterPath,
          settings.python.activationScript
        );

        const result = await exec(command, {
          encoding: 'utf-8',
          cwd: workingDirectory,
          env: env,
        });
        diagnostics = this.processReport(
          result.stdout,
          await ansibleLintConfigPromise,
          workingDirectory
        );

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
          if (execError.code === 2) {
            diagnostics = this.processReport(
              execError.stdout,
              await ansibleLintConfigPromise,
              workingDirectory
            );
          } else {
            this.connection.window.showErrorMessage(execError.message);
          }

          if (execError.stderr) {
            this.connection.console.info(`[ansible-lint] ${execError.stderr}`);
          }
        } else {
          this.connection.console.error(
            `Exception in AnsibleLint service: ${JSON.stringify(error)}`
          );
        }
      }

      if (progressTracker) {
        progressTracker.done();
      }
    }
    return diagnostics;
  }

  private processReport(
    result: string,
    ansibleLintConfig: IAnsibleLintConfig | undefined,
    workingDirectory: string
  ): Map<string, Diagnostic[]> {
    const diagnostics: Map<string, Diagnostic[]> = new Map();
    if (!result) {
      this.connection.console.warn(
        'Standard output from ansible-lint is suspiciously empty.'
      );
      return diagnostics;
    }
    try {
      const report = JSON.parse(result);
      if (report instanceof Array) {
        for (const item of report) {
          if (
            typeof item.check_name === 'string' &&
            item.location &&
            typeof item.location.path === 'string' &&
            item.location.lines &&
            (item.location.lines.begin ||
              typeof item.location.lines.begin === 'number')
          ) {
            const begin_line =
              item.location.lines.begin.line || item.location.lines.begin || 1;
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

            let severity: DiagnosticSeverity = DiagnosticSeverity.Error;
            if (ansibleLintConfig) {
              const lintRuleName = (item.check_name as string).match(
                /\[(?<name>[a-z\-]+)\].*/
              )?.groups?.name;

              if (
                lintRuleName &&
                ansibleLintConfig.warnList.has(lintRuleName)
              ) {
                severity = DiagnosticSeverity.Warning;
              }

              const categories = item.categories;
              if (categories instanceof Array) {
                if (categories.some((c) => ansibleLintConfig.warnList.has(c))) {
                  severity = DiagnosticSeverity.Warning;
                }
              }
            }
            const path = `${workingDirectory}/${item.location.path}`;
            const locationUri = URI.file(path).toString();

            let fileDiagnostics = diagnostics.get(locationUri);
            if (!fileDiagnostics) {
              fileDiagnostics = [];
              diagnostics.set(locationUri, fileDiagnostics);
            }
            let message: string = item.check_name;
            if (item.description) {
              message += `\nDescription: ${item.description}`;
            }
            fileDiagnostics.push({
              message: message,
              range: range || Range.create(0, 0, 0, 0),
              severity: severity,
              source: 'Ansible',
            });
          }
        }
      }
    } catch (error) {
      this.connection.window.showErrorMessage(
        'Could not parse ansible-lint output. Please check your ansible-lint installation & configuration.' +
          ' More info in `Ansible Server` output.'
      );
      let message: string;
      if (error instanceof Error) {
        message = error.message;
      } else {
        message = JSON.stringify(error);
      }
      this.connection.console.error(
        `Exception while parsing ansible-lint output: ${message}` +
          `\nTried to parse the following:\n${result}`
      );
    }
    return diagnostics;
  }

  public handleWatchedDocumentChange(
    params: DidChangeWatchedFilesParams
  ): void {
    for (const fileEvent of params.changes) {
      // remove from cache on any change
      this.configCache.delete(fileEvent.uri);
    }
  }

  private async getAnsibleLintConfig(
    workingDirectory: string,
    configPath: string | undefined
  ): Promise<IAnsibleLintConfig | undefined> {
    if (configPath) {
      const absConfigPath = path.resolve(workingDirectory, configPath);
      let config = this.configCache.get(absConfigPath);
      if (!config) {
        config = await this.readAnsibleLintConfig(absConfigPath);
        this.configCache.set(absConfigPath, config);
      }
      return config;
    }
  }

  private async readAnsibleLintConfig(
    configPath: string
  ): Promise<IAnsibleLintConfig> {
    const config = {
      warnList: new Set<string>(),
    };
    try {
      const configContents = await fs.readFile(configPath, {
        encoding: 'utf8',
      });
      parseAllDocuments(configContents).forEach((configDoc) => {
        const configObject: unknown = configDoc.toJSON();
        if (
          hasOwnProperty(configObject, 'warn_list') &&
          configObject.warn_list instanceof Array
        ) {
          for (const warn_item of configObject.warn_list) {
            if (typeof warn_item === 'string') {
              config.warnList.add(warn_item);
            }
          }
        }
      });
    } catch (error) {
      this.connection.window.showErrorMessage(error);
    }
    return config;
  }

  private async findAnsibleLintConfigFile(
    uri: string
  ): Promise<string | undefined> {
    // find configuration path
    let configPath;
    const pathArray = uri.split('/');

    // Find first configuration file going up until workspace root
    for (let index = pathArray.length - 1; index >= 0; index--) {
      const candidatePath = pathArray
        .slice(0, index)
        .concat('.ansible-lint')
        .join('/');
      if (!candidatePath.startsWith(this.context.workspaceFolder.uri)) {
        // we've gone out of the workspace folder
        break;
      }
      if (await fileExists(candidatePath)) {
        configPath = candidatePath;
        break;
      }
    }
    return configPath;
  }
}
