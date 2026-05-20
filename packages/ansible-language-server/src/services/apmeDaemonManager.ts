import { Connection } from "vscode-languageserver";
import { WorkspaceFolderContext } from "@src/services/workspaceManager.js";
import { CommandRunner } from "@src/utils/commandRunner.js";

const DAEMON_START_TIMEOUT = 30_000;
const DAEMON_STOP_TIMEOUT = 10_000;
const HEALTH_CHECK_TIMEOUT = 10_000;
const PORT_RELEASE_DELAY = 3_000;

const CRASH_PATTERNS = [
  "connection refused",
  "econnreset",
  "econnrefused",
  "epipe",
  "daemon is not running",
  "grpc",
  "unavailable",
  "spawn",
  "enoent",
];

export class ApmeDaemonManager {
  private connection: Connection;
  private context: WorkspaceFolderContext;

  constructor(connection: Connection, context: WorkspaceFolderContext) {
    this.connection = connection;
    this.context = context;
  }

  public async startDaemon(): Promise<boolean> {
    try {
      const { executable, runner } = await this.getRunner();
      this.connection.console.log("[apme] Starting daemon...");
      await runner.runCommand(
        executable,
        "daemon start",
        undefined,
        undefined,
        DAEMON_START_TIMEOUT,
      );
      this.connection.console.log("[apme] Daemon started successfully");
      return true;
    } catch (error) {
      if (error instanceof Error) {
        const msg = error.message || "";
        const stderr = (error as { stderr?: string }).stderr || "";
        const combined = msg + stderr;

        if (combined.includes("already running")) {
          this.connection.console.log("[apme] Daemon already running");
          return true;
        }

        if (combined.includes("Port") && combined.includes("in use")) {
          this.connection.console.warn(
            "[apme] Port conflict detected, waiting for ports to free...",
          );
          await this.sleep(PORT_RELEASE_DELAY);
          return this.startDaemonRetry();
        }

        this.connection.console.warn(`[apme] Daemon start failed: ${msg}`);
      }
      return false;
    }
  }

  private async startDaemonRetry(): Promise<boolean> {
    try {
      const { executable, runner } = await this.getRunner();
      await runner.runCommand(
        executable,
        "daemon start",
        undefined,
        undefined,
        DAEMON_START_TIMEOUT,
      );
      this.connection.console.log("[apme] Daemon started after port retry");
      return true;
    } catch (error) {
      if (error instanceof Error) {
        const combined =
          (error.message || "") +
          ((error as { stderr?: string }).stderr || "");
        if (combined.includes("already running")) {
          this.connection.console.log("[apme] Daemon already running");
          return true;
        }
        this.connection.console.warn(
          `[apme] Daemon start retry failed: ${error.message}`,
        );
      }
      return false;
    }
  }

  public async stopDaemon(): Promise<void> {
    try {
      const { executable, runner } = await this.getRunner();
      this.connection.console.log("[apme] Stopping daemon...");
      await runner.runCommand(
        executable,
        "daemon stop",
        undefined,
        undefined,
        DAEMON_STOP_TIMEOUT,
      );
      this.connection.console.log("[apme] Daemon stopped");
    } catch (error) {
      if (error instanceof Error) {
        this.connection.console.warn(
          `[apme] Daemon stop failed (best-effort): ${error.message}`,
        );
      }
    }
  }

  public async restartDaemon(): Promise<boolean> {
    await this.stopDaemon();
    await this.sleep(PORT_RELEASE_DELAY);
    return this.startDaemon();
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const { executable, runner } = await this.getRunner();
      const result = await runner.runCommand(
        executable,
        "health-check --json",
        undefined,
        undefined,
        HEALTH_CHECK_TIMEOUT,
      );
      try {
        const health = JSON.parse(result.stdout);
        const services = Object.values(health) as Array<{
          status?: string;
        }>;
        return services.every((s) => s.status === "ok");
      } catch {
        return result.stdout.includes("ok");
      }
    } catch {
      return false;
    }
  }

  public async ensureHealthy(): Promise<boolean> {
    // Try starting first — if already running, this is a no-op
    const started = await this.startDaemon();
    if (started && (await this.isHealthy())) {
      return true;
    }
    this.connection.console.warn(
      "[apme] Daemon unhealthy after start, attempting full restart...",
    );
    const restarted = await this.restartDaemon();
    if (!restarted) {
      return false;
    }
    return this.isHealthy();
  }

  public isDaemonCrashError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const msg = (
      (error.message || "") +
      ((error as { stderr?: string }).stderr || "")
    ).toLowerCase();
    return CRASH_PATTERNS.some((p) => msg.includes(p));
  }

  private async getRunner(): Promise<{
    executable: string;
    runner: CommandRunner;
  }> {
    const settings = await this.context.documentSettings.get(
      this.context.workspaceFolder.uri,
    );
    const executable = settings.executionEnvironment.enabled
      ? "apme"
      : settings.validation.apme.path;
    const runner = new CommandRunner(this.connection, this.context, settings);
    return { executable, runner };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
