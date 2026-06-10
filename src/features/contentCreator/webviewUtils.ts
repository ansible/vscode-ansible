/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref } from "vue";
import type { Ref } from "vue";
import { vscodeApi } from "@webviews/lightspeed/src/utils";

interface CommonWebviewState {
  homeDir: Ref<string>;
  logs: Ref<string>;
  logFileUrl: Ref<string>;
  logFilePath: Ref<string>;
  defaultLogFilePath: Ref<string>;
  isCreating: Ref<boolean>;
  openLogFileButtonDisabled: Ref<boolean>;
  createButtonDisabled: Ref<boolean>;
}

export function useCommonWebviewState(): CommonWebviewState {
  return {
    homeDir: ref(""),
    logs: ref(""),
    logFileUrl: ref(""),
    logFilePath: ref(""),
    defaultLogFilePath: ref(""),
    isCreating: ref(false),
    openLogFileButtonDisabled: ref(true),
    createButtonDisabled: ref(false),
  };
}

interface MessageHandlerConfig {
  onHomeDirectory?: (data: string) => void;
  onFolderSelected?: (data: string) => void;
  onFileSelected?: (data: string) => void;
  onHomedirAndTempdir?: (homedir: string, tempdir: string) => void;
  onLogs?: (data: string) => void;
  onExecutionLog?: (args: any) => void;
  onADEPresence?: (present: boolean) => void;
}

interface Message {
  type?: string;
  command?: string;
  data?: unknown;
  homedir?: string;
  tempdir?: string;
  arguments?: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

class MessageRouter {
  private typeHandlers: Record<string, (message: Message) => void>;
  private commandHandlers: Record<string, (message: Message) => void>;

  constructor(
    private config: MessageHandlerConfig,
    private commonState?: Partial<CommonWebviewState>,
  ) {
    this.typeHandlers = {
      homeDirectory: (message) => {
        const data = asString(message.data);
        if (data !== undefined) {
          this.onHomeDirectory(data);
        }
      },
      folderSelected: (message) => {
        const data = asString(message.data);
        if (data !== undefined) {
          this.onFolderSelected(data);
        }
      },
      fileSelected: (message) => {
        const data = asString(message.data);
        if (data !== undefined) {
          this.onFileSelected(data);
        }
      },
      logs: (message) => {
        const data = asString(message.data);
        if (data !== undefined) {
          this.onLogs(data);
        }
      },
    };

    this.commandHandlers = {
      homedirAndTempdir: (message) => {
        const homedir = asString(message.homedir);
        const tempdir = asString(message.tempdir);
        if (homedir && tempdir) {
          this.onHomedirAndTempdir(homedir, tempdir);
        }
      },
      "execution-log": (message) => {
        if (isRecord(message.arguments)) {
          this.onExecutionLog(message.arguments);
        }
      },
      ADEPresence: (message) => {
        if (typeof message.arguments === "boolean") {
          this.onADEPresence(message.arguments);
        }
      },
    };
  }

  handle(message: Message): void {
    if (message.type && this.typeHandlers[message.type]) {
      this.typeHandlers[message.type](message);
    }
    if (message.command && this.commandHandlers[message.command]) {
      this.commandHandlers[message.command](message);
    }
  }

  private onHomeDirectory(data: string): void {
    this.config?.onHomeDirectory?.(data);
    if (this.commonState?.homeDir) {
      this.commonState.homeDir.value = data;
    }
  }

  private onFolderSelected(data: string): void {
    this.config?.onFolderSelected?.(data);
  }

  private onFileSelected(data: string): void {
    this.config?.onFileSelected?.(data);
    if (this.commonState?.logFilePath) {
      this.commonState.logFilePath.value = data;
    }
  }

  private onLogs(data: string): void {
    this.config?.onLogs?.(data);
    if (this.commonState?.logs) {
      this.commonState.logs.value += data + "\n";
    }
  }

  private onHomedirAndTempdir(homedir: string, tempdir: string): void {
    this.config?.onHomedirAndTempdir?.(homedir, tempdir);
    if (this.commonState?.homeDir && this.commonState?.defaultLogFilePath) {
      this.commonState.homeDir.value = homedir;
      this.commonState.defaultLogFilePath.value = `${tempdir}/ansible-creator.log`;
    }
  }

  private onExecutionLog(args: unknown): void {
    this.config?.onExecutionLog?.(args);

    if (
      !isRecord(args) ||
      !this.commonState?.logs ||
      !this.commonState?.logFileUrl ||
      !this.commonState?.openLogFileButtonDisabled ||
      !this.commonState?.createButtonDisabled ||
      !this.commonState?.isCreating
    ) {
      return;
    }

    const commandOutput = asString(args.commandOutput) ?? "";
    const logFileUrl = asString(args.logFileUrl) ?? "";
    const status = asString(args.status);

    this.commonState.logs.value = commandOutput;
    this.commonState.logFileUrl.value = logFileUrl;
    this.commonState.openLogFileButtonDisabled.value = !logFileUrl;
    this.commonState.createButtonDisabled.value = false;

    if (status === "passed" || status === "failed") {
      this.commonState.isCreating.value = false;
    }
  }

  private onADEPresence(present: boolean): void {
    this.config?.onADEPresence?.(present);
  }
}

export function setupMessageHandler(
  config: MessageHandlerConfig,
  commonState?: Partial<CommonWebviewState>,
) {
  const router = new MessageRouter(config, commonState);

  const messageHandler = (event: MessageEvent) => {
    const payload = event.data;
    if (!isRecord(payload)) {
      return;
    }
    const msg = payload as Message;
    if (msg.type !== undefined && typeof msg.type !== "string") {
      return;
    }
    if (msg.command !== undefined && typeof msg.command !== "string") {
      return;
    }
    router.handle(msg);
  };

  window.addEventListener("message", messageHandler);
  return messageHandler;
}

// Utility functions remain the same
export function openFolderExplorer(
  defaultPath?: string,
  homeDir?: string,
  options?: { selectOption?: string },
) {
  const actualDefaultPath = defaultPath || homeDir || "";
  vscodeApi.postMessage({
    type: "openFolderExplorer",
    payload: {
      defaultPath: actualDefaultPath,
      ...(options?.selectOption && { selectOption: options.selectOption }),
    },
  });
}

export function openFileExplorer(
  logFilePath: string,
  defaultLogFilePath: string,
  homeDir: string,
) {
  const getDirectoryPath = (fullPath: string): string => {
    if (!fullPath) return "";
    const lastSlashIndex = fullPath.lastIndexOf("/");
    return lastSlashIndex !== -1
      ? fullPath.substring(0, lastSlashIndex)
      : fullPath;
  };
  const defaultPath = logFilePath || defaultLogFilePath || homeDir;
  const directoryPath = getDirectoryPath(defaultPath);
  vscodeApi.postMessage({
    type: "openFileExplorer",
    payload: {
      defaultPath: directoryPath || homeDir,
    },
  });
}

export function checkADEPresence() {
  vscodeApi.postMessage({
    type: "check-ade-presence",
  });
}

export function clearLogs(logsRef: Ref<string>) {
  logsRef.value = "";
}

export function copyLogs(logs: string) {
  vscodeApi.postMessage({
    type: "init-copy-logs",
    payload: {
      initExecutionLogs: logs,
    },
  });
}

export function openLogFile(logFileUrl: string) {
  vscodeApi.postMessage({
    type: "init-open-log-file",
    payload: {
      logFileUrl: logFileUrl,
    },
  });
}

export function openScaffoldedFolder(
  url: string,
  type: "collection" | "project" = "collection",
) {
  const payload =
    type === "collection" ? { collectionUrl: url } : { projectUrl: url };
  vscodeApi.postMessage({
    type: "init-open-scaffolded-folder",
    payload,
  });
}

export function initializeUI() {
  vscodeApi.postMessage({ type: "ui-mounted" });
}

export function clearAllFields(
  fields: Record<string, Ref>,
  defaults: Record<string, any> = {},
) {
  Object.keys(fields).forEach((key) => {
    if (defaults[key] !== undefined) {
      fields[key].value = defaults[key];
    } else {
      const currentValue = fields[key].value;
      if (typeof currentValue === "string") {
        fields[key].value = "";
      } else if (typeof currentValue === "boolean") {
        fields[key].value = false;
      } else if (typeof currentValue === "number") {
        fields[key].value = 0;
      }
    }
  });
  initializeUI();
}

export function createFormValidator(validators: Record<string, () => boolean>) {
  return () => {
    return Object.values(validators).every((validator) => validator());
  };
}

export function createActionWrapper(
  isCreating: Ref<boolean>,
  logs: Ref<string>,
  createButtonDisabled: Ref<boolean>,
  action: () => void,
) {
  return () => {
    isCreating.value = true;
    logs.value = "";
    createButtonDisabled.value = true;
    action();
  };
}
