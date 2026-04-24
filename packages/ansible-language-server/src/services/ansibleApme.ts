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
import { WorkspaceFolderContext } from "@src/services/workspaceManager.js";
import { CommandRunner } from "@src/utils/commandRunner.js";

interface ApmeViolation {
  rule_id: string;
  severity: string;
  message: string;
  file: string;
  line: number;
  path?: string;
  remediation_class?: string;
  remediation_resolution?: string;
  scope?: string;
}

interface ApmeCheckOutput {
  violations: ApmeViolation[];
  count: number;
  scan_id?: string;
  remediation_summary?: {
    auto_fixable: number;
    ai_candidate: number;
    manual_review: number;
  };
  diffs?: Array<{ path: string; diff: string }>;
  files_updated?: number;
}

export class AnsibleApme {
  private connection: Connection;
  private context: WorkspaceFolderContext;
  private useProgressTracker = false;
  private remediationInFlight: Set<string> = new Set();

  constructor(connection: Connection, context: WorkspaceFolderContext) {
    this.connection = connection;
    this.context = context;
    this.useProgressTracker =
      !!context.clientCapabilities.window?.workDoneProgress;
  }

  public async doValidate(
    textDocument: TextDocument,
  ): Promise<Map<string, Diagnostic[]>> {
    const diagnostics: Map<string, Diagnostic[]> = new Map();
    const settings = await this.context.documentSettings.get(textDocument.uri);

    if (!settings.validation?.enabled || !settings.validation?.apme?.enabled) {
      this.connection.console.log("[apme] Validation disabled, skipping");
      return diagnostics;
    }

    const docPath = URI.parse(textDocument.uri).path;
    const workingDirectory = URI.parse(this.context.workspaceFolder.uri).path;
    const mountPaths = new Set([workingDirectory, path.dirname(docPath)]);

    this.connection.console.log(`[apme] Validating file: ${docPath}`);

    let apmeArguments = settings.validation.apme.arguments ?? "";
    apmeArguments = `check "${docPath}" --json ${apmeArguments}`;

    if (settings.validation.apme.autoFixOnSave) {
      if (this.remediationInFlight.has(docPath)) {
        this.connection.console.log(
          `[apme] Skipping auto-fix: remediation already in flight for ${docPath}`,
        );
        return diagnostics;
      }
      return this.doRemediateAndValidate(textDocument);
    }

    const progressTracker = this.useProgressTracker
      ? await this.connection.window.createWorkDoneProgress()
      : { begin: () => {}, done: () => {} };

    progressTracker.begin("apme", undefined, "Checking...");

    const commandRunner = new CommandRunner(
      this.connection,
      this.context,
      settings,
    );

    const apmeExecutable = settings.executionEnvironment.enabled
      ? "apme"
      : settings.validation.apme.path;

    try {
      this.connection.console.log(
        `[apme] Running: ${apmeExecutable} ${apmeArguments}`,
      );
      const result = await commandRunner.runCommand(
        apmeExecutable,
        apmeArguments,
        workingDirectory,
        mountPaths,
      );

      const diagnosticResult = this.parseApmeOutput(result.stdout, workingDirectory);
      this.connection.console.log(
        `[apme] Check complete: ${this.countDiagnostics(diagnosticResult)} violation(s) found`,
      );
      return diagnosticResult;
    } catch (error) {
      if (error instanceof Error) {
        const execError = error as ExecException & {
          stdout: string;
          stderr: string;
        };

        // Exit code 1 = violations found (not an error)
        if (execError.stdout) {
          const diagnosticResult = this.parseApmeOutput(execError.stdout, workingDirectory);
          this.connection.console.log(
            `[apme] Check complete (exit 1): ${this.countDiagnostics(diagnosticResult)} violation(s) found`,
          );
          return diagnosticResult;
        }

        if (execError.stderr) {
          this.connection.console.warn(`[apme] stderr: ${execError.stderr}`);
        }
        this.connection.console.error(`[apme] Command failed: ${execError.message}`);
      } else {
        this.connection.console.error(
          `[apme] Unexpected error: ${JSON.stringify(error)}`,
        );
      }
      return new Map();
    } finally {
      progressTracker.done();
    }
  }

  public async doValidateWorkspace(): Promise<Map<string, Diagnostic[]>> {
    const workspaceUri = this.context.workspaceFolder.uri;
    const settings = await this.context.documentSettings.get(workspaceUri);

    if (!settings.validation?.enabled || !settings.validation?.apme?.enabled) {
      return new Map();
    }

    const workingDirectory = URI.parse(workspaceUri).path;
    this.connection.console.log(
      `[apme] Starting workspace scan: ${workingDirectory}`,
    );
    const mountPaths = new Set([workingDirectory]);

    let apmeArguments = settings.validation.apme.arguments ?? "";
    apmeArguments = `check "${workingDirectory}" --json ${apmeArguments}`;

    const progressTracker = this.useProgressTracker
      ? await this.connection.window.createWorkDoneProgress()
      : { begin: () => {}, done: () => {} };

    progressTracker.begin("apme", undefined, "Scanning workspace...");

    const commandRunner = new CommandRunner(
      this.connection,
      this.context,
      settings,
    );

    const apmeExecutable = settings.executionEnvironment.enabled
      ? "apme"
      : settings.validation.apme.path;

    try {
      const result = await commandRunner.runCommand(
        apmeExecutable,
        apmeArguments,
        workingDirectory,
        mountPaths,
      );

      return this.parseApmeOutput(result.stdout, workingDirectory);
    } catch (error) {
      if (error instanceof Error) {
        const execError = error as ExecException & {
          stdout: string;
          stderr: string;
        };

        if (execError.stdout) {
          return this.parseApmeOutput(execError.stdout, workingDirectory);
        }

        this.connection.console.error(`[apme] Workspace scan error: ${execError.message}`);
      }
      return new Map();
    } finally {
      progressTracker.done();
    }
  }

  public async doRemediate(
    filePath: string,
  ): Promise<{ success: boolean; filesUpdated: number }> {
    if (this.remediationInFlight.has(filePath)) {
      this.connection.console.warn(
        `[apme] Skipping remediate: already in flight for ${filePath}`,
      );
      return { success: false, filesUpdated: 0 };
    }

    this.connection.console.log(`[apme] Starting remediation: ${filePath}`);
    this.remediationInFlight.add(filePath);

    try {
      const workspaceUri = this.context.workspaceFolder.uri;
      const settings = await this.context.documentSettings.get(workspaceUri);
      const workingDirectory = URI.parse(workspaceUri).path;
      const mountPaths = new Set([workingDirectory, path.dirname(filePath)]);

      let apmeArguments = settings.validation.apme.arguments ?? "";
      apmeArguments = `remediate "${filePath}" --json ${apmeArguments}`;

      const commandRunner = new CommandRunner(
        this.connection,
        this.context,
        settings,
      );

      const apmeExecutable = settings.executionEnvironment.enabled
        ? "apme"
        : settings.validation.apme.path;

      const result = await commandRunner.runCommand(
        apmeExecutable,
        apmeArguments,
        workingDirectory,
        mountPaths,
      );

      try {
        const output = JSON.parse(result.stdout);
        return {
          success: true,
          filesUpdated: output.files_updated ?? 0,
        };
      } catch {
        return { success: true, filesUpdated: 0 };
      }
    } catch (error) {
      if (error instanceof Error) {
        const execError = error as ExecException & {
          stdout: string;
          stderr: string;
        };
        // Exit code 1 = remaining violations (remediation ran but didn't fix everything)
        if (execError.stdout) {
          try {
            const output = JSON.parse(execError.stdout);
            return {
              success: true,
              filesUpdated: output.files_updated ?? 0,
            };
          } catch {
            // fall through
          }
        }
        this.connection.console.error(`[apme] Remediation error: ${execError.message}`);
      }
      return { success: false, filesUpdated: 0 };
    } finally {
      this.remediationInFlight.delete(filePath);
    }
  }

  private async doRemediateAndValidate(
    textDocument: TextDocument,
  ): Promise<Map<string, Diagnostic[]>> {
    const docPath = URI.parse(textDocument.uri).path;

    await this.doRemediate(docPath);

    const workingDirectory = URI.parse(this.context.workspaceFolder.uri).path;
    const mountPaths = new Set([workingDirectory, path.dirname(docPath)]);
    const settings = await this.context.documentSettings.get(textDocument.uri);

    let apmeArguments = settings.validation.apme.arguments ?? "";
    apmeArguments = `check "${docPath}" --json ${apmeArguments}`;

    const commandRunner = new CommandRunner(
      this.connection,
      this.context,
      settings,
    );

    const apmeExecutable = settings.executionEnvironment.enabled
      ? "apme"
      : settings.validation.apme.path;

    try {
      const result = await commandRunner.runCommand(
        apmeExecutable,
        apmeArguments,
        workingDirectory,
        mountPaths,
      );
      return this.parseApmeOutput(result.stdout, workingDirectory);
    } catch (error) {
      if (error instanceof Error) {
        const execError = error as ExecException & { stdout: string };
        if (execError.stdout) {
          return this.parseApmeOutput(execError.stdout, workingDirectory);
        }
      }
      return new Map();
    }
  }

  private parseApmeOutput(
    stdout: string,
    workingDirectory: string,
  ): Map<string, Diagnostic[]> {
    const diagnostics: Map<string, Diagnostic[]> = new Map();

    if (!stdout) {
      return diagnostics;
    }

    try {
      const output: ApmeCheckOutput = JSON.parse(stdout);
      const violations = output.violations ?? [];

      if (!Array.isArray(violations)) {
        return diagnostics;
      }

      for (const violation of violations) {
        if (!violation.rule_id || !violation.file) {
          continue;
        }

        const lineNum = Math.max(0, (violation.line ?? 1) - 1);
        const start: Position = { line: lineNum, character: 0 };
        const end: Position = { line: lineNum, character: integer.MAX_VALUE };
        const range: Range = { start, end };

        let severity: DiagnosticSeverity;
        switch (violation.severity) {
          case "high":
          case "error":
            severity = DiagnosticSeverity.Error;
            break;
          case "medium":
          case "warning":
            severity = DiagnosticSeverity.Warning;
            break;
          default:
            severity = DiagnosticSeverity.Information;
            break;
        }

        const remClass = violation.remediation_class ?? "manual-review";
        const fixable = remClass === "auto-fixable";
        const aiProposable = remClass === "ai-candidate";
        const tier = fixable ? 1 : aiProposable ? 2 : 3;

        const filePath = violation.file.startsWith("/")
          ? violation.file
          : `${workingDirectory}/${violation.file}`;
        const locationUri = URI.file(filePath).toString();

        let fileDiagnostics = diagnostics.get(locationUri);
        if (!fileDiagnostics) {
          fileDiagnostics = [];
          diagnostics.set(locationUri, fileDiagnostics);
        }

        const tierLabel =
          tier === 1
            ? " [auto-fixable]"
            : tier === 2
              ? " [ai-candidate]"
              : "";

        fileDiagnostics.push({
          message: `${violation.rule_id}: ${violation.message}${tierLabel}`,
          range: range,
          severity: severity,
          source: "Ansible [apme]",
          code: violation.rule_id,
          codeDescription: {
            href: `https://apme.readthedocs.io/rules/${violation.rule_id.toLowerCase()}/`,
          },
          data: {
            tier,
            fixable,
            ai_proposable: aiProposable,
            remediation_class: remClass,
            rule_id: violation.rule_id,
          },
        });
      }
    } catch (error) {
      this.connection.console.error(
        `[apme] Failed to parse output: ${error instanceof Error ? error.message : String(error)}` +
          `\nTried to parse:\n${stdout.substring(0, 500)}`,
      );
    }

    return diagnostics;
  }

  private countDiagnostics(diagnostics: Map<string, Diagnostic[]>): number {
    let count = 0;
    for (const fileDiags of diagnostics.values()) {
      count += fileDiags.length;
    }
    return count;
  }
}
