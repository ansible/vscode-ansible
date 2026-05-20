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
  private workspaceScanInFlight: Promise<Map<string, Diagnostic[]>> | null =
    null;
  private cachedDiagnostics: Map<string, Diagnostic[]> | null = null;
  private scanDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingScanResolvers: Array<{
    resolve: (v: Map<string, Diagnostic[]>) => void;
  }> = [];

  constructor(connection: Connection, context: WorkspaceFolderContext) {
    this.connection = connection;
    this.context = context;
    this.useProgressTracker =
      !!context.clientCapabilities.window?.workDoneProgress;
  }

  public async doValidate(
    textDocument: TextDocument,
  ): Promise<Map<string, Diagnostic[]>> {
    const docUri = textDocument.uri;

    // If a project scan is already running, wait for it
    if (this.workspaceScanInFlight) {
      this.connection.console.log(
        "[apme] Project scan in progress, waiting for results...",
      );
      const wsResults = await this.workspaceScanInFlight;
      return this.extractFileResults(docUri, wsResults);
    }

    const settings = await this.context.documentSettings.get(textDocument.uri);
    if (!settings.validation?.enabled || !settings.validation?.apme?.enabled) {
      return new Map();
    }

    // Return cached results immediately and schedule a background re-scan
    if (this.cachedDiagnostics) {
      this.connection.console.log(
        "[apme] Returning cached diagnostics, scheduling background re-scan...",
      );
      this.scheduleProjectScan();
      return this.extractFileResults(docUri, this.cachedDiagnostics);
    }

    // No cache, no scan in flight — run a full project scan now
    return this.extractFileResults(docUri, await this.runProjectScan());
  }

  private scheduleProjectScan(): void {
    if (this.scanDebounceTimer) clearTimeout(this.scanDebounceTimer);
    this.scanDebounceTimer = setTimeout(() => {
      this.scanDebounceTimer = undefined;
      this.runProjectScan().then((results) => {
        // Publish updated diagnostics for all files with violations
        for (const [fileUri, fileDiags] of results) {
          this.connection.sendDiagnostics({
            uri: fileUri,
            diagnostics: fileDiags,
          });
        }
        // Clear diagnostics for files that no longer have violations
        if (this.cachedDiagnostics) {
          for (const prevUri of this.cachedDiagnostics.keys()) {
            if (!results.has(prevUri)) {
              this.connection.sendDiagnostics({
                uri: prevUri,
                diagnostics: [],
              });
            }
          }
        }
        this.connection.console.log(
          `[apme] Background re-scan complete: ${this.countDiagnostics(results)} violation(s)`,
        );
      });
    }, 2000);
  }

  private async runProjectScan(): Promise<Map<string, Diagnostic[]>> {
    if (this.workspaceScanInFlight) {
      return this.workspaceScanInFlight;
    }

    this.connection.sendNotification("ansible/apme/scanStatus", {
      scanning: true,
      tool: "apme",
    });

    const scanPromise = this._runProjectScanInternal();
    this.workspaceScanInFlight = scanPromise;
    try {
      const result = await scanPromise;
      this.cachedDiagnostics = result;
      return result;
    } finally {
      this.workspaceScanInFlight = null;
      this.connection.sendNotification("ansible/apme/scanStatus", {
        scanning: false,
        tool: "apme",
        violations: this.countDiagnostics(this.cachedDiagnostics ?? new Map()),
      });
    }
  }

  private async _runProjectScanInternal(): Promise<Map<string, Diagnostic[]>> {
    const workspaceUri = this.context.workspaceFolder.uri;
    const settings = await this.context.documentSettings.get(workspaceUri);

    if (!settings.validation?.enabled || !settings.validation?.apme?.enabled) {
      return new Map();
    }

    const workingDirectory = URI.parse(workspaceUri).path;
    const mountPaths = new Set([workingDirectory]);

    let apmeArguments = settings.validation.apme.arguments ?? "";
    apmeArguments = `check "${workingDirectory}" --json ${apmeArguments}`;

    const commandRunner = new CommandRunner(
      this.connection,
      this.context,
      settings,
    );

    const apmeExecutable = settings.executionEnvironment.enabled
      ? "apme"
      : settings.validation.apme.path;

    const timeoutMs =
      (settings.validation.apme.timeout ?? 120) * 1000 || undefined;

    try {
      this.connection.console.log(
        `[apme] Running project scan: ${apmeExecutable} ${apmeArguments}`,
      );
      const result = await commandRunner.runCommand(
        apmeExecutable,
        apmeArguments,
        workingDirectory,
        mountPaths,
        timeoutMs,
      );

      const diagnosticResult = this.parseApmeOutput(
        result.stdout,
        workingDirectory,
      );
      this.connection.console.log(
        `[apme] Project scan complete: ${this.countDiagnostics(diagnosticResult)} violation(s) found`,
      );
      return diagnosticResult;
    } catch (error) {
      if (error instanceof Error) {
        const execError = error as ExecException & {
          stdout: string;
          stderr: string;
        };
        if (execError.stdout) {
          const diagnosticResult = this.parseApmeOutput(
            execError.stdout,
            workingDirectory,
          );
          this.connection.console.log(
            `[apme] Project scan complete (exit 1): ${this.countDiagnostics(diagnosticResult)} violation(s) found`,
          );
          return diagnosticResult;
        }
        this.connection.console.error(
          `[apme] Project scan failed: ${execError.message}`,
        );
      }

      if (this.context.apmeDaemonManager.isDaemonCrashError(error)) {
        this.connection.console.warn(
          "[apme] Detected daemon crash, attempting restart and retry...",
        );
        const restarted = await this.context.apmeDaemonManager.restartDaemon();
        if (restarted) {
          try {
            const retryResult = await commandRunner.runCommand(
              apmeExecutable,
              apmeArguments,
              workingDirectory,
              mountPaths,
              timeoutMs,
            );
            return this.parseApmeOutput(retryResult.stdout, workingDirectory);
          } catch (retryError) {
            if (retryError instanceof Error) {
              const retryExec = retryError as ExecException & {
                stdout: string;
              };
              if (retryExec.stdout) {
                return this.parseApmeOutput(
                  retryExec.stdout,
                  workingDirectory,
                );
              }
            }
          }
        }
      }

      return this.cachedDiagnostics ?? new Map();
    }
  }

  private extractFileResults(
    docUri: string,
    allResults: Map<string, Diagnostic[]>,
  ): Map<string, Diagnostic[]> {
    const result: Map<string, Diagnostic[]> = new Map();
    const fileDiags = allResults.get(docUri);
    result.set(docUri, fileDiags ?? []);
    return result;
  }

  public async doValidateWorkspace(): Promise<Map<string, Diagnostic[]>> {
    const daemonReady = await this.context.apmeDaemonManager.ensureHealthy();
    if (!daemonReady) {
      this.connection.console.error(
        "[apme] Daemon is unhealthy and could not be restarted; skipping workspace scan",
      );
      return new Map();
    }
    return this.runProjectScan();
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

    const timeoutMs =
      (settings.validation.apme.timeout ?? 120) * 1000 || undefined;

    try {
      const result = await commandRunner.runCommand(
        apmeExecutable,
        apmeArguments,
        workingDirectory,
        mountPaths,
        timeoutMs,
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
        this.connection.console.error(
          `[apme] Remediation error: ${execError.message}`,
        );
      }

      if (this.context.apmeDaemonManager.isDaemonCrashError(error)) {
        this.connection.console.warn(
          "[apme] Detected daemon crash during remediation, attempting restart...",
        );
        const restarted = await this.context.apmeDaemonManager.restartDaemon();
        if (restarted) {
          try {
            const retryResult = await commandRunner.runCommand(
              apmeExecutable,
              apmeArguments,
              workingDirectory,
              mountPaths,
              timeoutMs,
            );
            try {
              const output = JSON.parse(retryResult.stdout);
              return {
                success: true,
                filesUpdated: output.files_updated ?? 0,
              };
            } catch {
              return { success: true, filesUpdated: 0 };
            }
          } catch {
            this.connection.console.error(
              "[apme] Remediation retry after daemon restart also failed",
            );
          }
        }
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

    const timeoutMs =
      (settings.validation.apme.timeout ?? 120) * 1000 || undefined;

    try {
      const result = await commandRunner.runCommand(
        apmeExecutable,
        apmeArguments,
        workingDirectory,
        mountPaths,
        timeoutMs,
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

      // Log remediation summary so users see what apme can auto-fix
      const summary = output.remediation_summary;
      if (summary && (summary.auto_fixable > 0 || summary.ai_candidate > 0)) {
        this.connection.console.log(
          `[apme] Remediation summary: ${summary.auto_fixable} auto-fixable, ` +
            `${summary.ai_candidate} AI-candidate, ${summary.manual_review} manual-review`,
        );
      }
    } catch (error) {
      this.connection.console.error(
        `[apme] Failed to parse output: ${error instanceof Error ? error.message : String(error)}` +
          `\nTried to parse:\n${stdout.substring(0, 2000)}`,
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
