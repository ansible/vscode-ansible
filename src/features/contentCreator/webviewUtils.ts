/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref, Ref } from "vue";
import { vscodeApi } from "../../../webviews/lightspeed/src/utils";

export interface CommonWebviewState {
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

export interface MessageHandlerConfig {
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
  data?: any;
  homedir?: string;
  tempdir?: string;
  arguments?: any;
}

class MessageRouter {
  constructor(
    private config: MessageHandlerConfig,
    private commonState?: Partial<CommonWebviewState>,
  ) {}

  handle(message: Message): void {
    if (message.type) {
      switch (message.type) {
        case "homeDirectory":
          this.onHomeDirectory(message.data);
          break;
        case "folderSelected":
          this.onFolderSelected(message.data);
          break;
        case "fileSelected":
          this.onFileSelected(message.data);
          break;
        case "logs":
          this.onLogs(message.data);
          break;
      }
    }

    if (message.command) {
      switch (message.command) {
        case "homedirAndTempdir":
          if (message.homedir && message.tempdir) {
            this.onHomedirAndTempdir(message.homedir, message.tempdir);
          }
          break;
        case "execution-log":
          this.onExecutionLog(message.arguments);
          break;
        case "ADEPresence":
          this.onADEPresence(message.arguments);
          break;
      }
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

  private onExecutionLog(args: any): void {
    this.config?.onExecutionLog?.(args);

    if (
      this.commonState?.logs &&
      this.commonState?.logFileUrl &&
      this.commonState?.openLogFileButtonDisabled &&
      this.commonState?.createButtonDisabled &&
      this.commonState?.isCreating
    ) {
      this.commonState.logs.value = args.commandOutput;
      this.commonState.logFileUrl.value = args.logFileUrl;
      this.commonState.openLogFileButtonDisabled.value = !args.logFileUrl;
      this.commonState.createButtonDisabled.value = false;

      if (args.status === "passed" || args.status === "failed") {
        this.commonState.isCreating.value = false;
      }
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
    router.handle(event.data);
  };

  window.addEventListener("message", messageHandler);
  return messageHandler;
}

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
