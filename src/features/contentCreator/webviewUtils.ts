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

export interface MessageHandlerConfig {
  onHomeDirectory?: (data: string) => void;
  onFolderSelected?: (data: string) => void;
  onFileSelected?: (data: string) => void;
  onHomedirAndTempdir?: (homedir: string, tempdir: string) => void;
  onLogs?: (data: string) => void;
  onExecutionLog?: (args: any) => void;
  onADEPresence?: (present: boolean) => void;
}

export function setupMessageHandler(
  config: MessageHandlerConfig,
  commonState?: Partial<CommonWebviewState>,
) {
  const messageHandler = (event: MessageEvent) => {
    const message = event.data;
    switch (message.type) {
      case "homeDirectory":
        if (config.onHomeDirectory) {
          config.onHomeDirectory(message.data);
        }
        if (commonState?.homeDir) {
          commonState.homeDir.value = message.data;
        }
        break;
      case "folderSelected":
        if (config.onFolderSelected) {
          config.onFolderSelected(message.data);
        }
        break;
      case "fileSelected":
        if (config.onFileSelected) {
          config.onFileSelected(message.data);
        }
        if (commonState?.logFilePath) {
          commonState.logFilePath.value = message.data;
        }
        break;
      case "logs":
        if (config.onLogs) {
          config.onLogs(message.data);
        }
        if (commonState?.logs) {
          commonState.logs.value += message.data + "\n";
        }
        break;
    }

    switch (message.command) {
      case "homedirAndTempdir":
        if (config.onHomedirAndTempdir) {
          config.onHomedirAndTempdir(message.homedir, message.tempdir);
        }
        if (commonState?.homeDir && commonState?.defaultLogFilePath) {
          commonState.homeDir.value = message.homedir;
          commonState.defaultLogFilePath.value = `${message.tempdir}/ansible-creator.log`;
        }
        break;
      case "execution-log":
        if (config.onExecutionLog) {
          config.onExecutionLog(message.arguments);
        }
        if (
          commonState?.logs &&
          commonState?.logFileUrl &&
          commonState?.openLogFileButtonDisabled &&
          commonState?.createButtonDisabled &&
          commonState?.isCreating
        ) {
          commonState.logs.value = message.arguments.commandOutput;
          commonState.logFileUrl.value = message.arguments.logFileUrl;
          commonState.openLogFileButtonDisabled.value =
            !message.arguments.logFileUrl;
          commonState.createButtonDisabled.value = false;

          if (
            message.arguments.status === "passed" ||
            message.arguments.status === "failed"
          ) {
            commonState.isCreating.value = false;
          }
        }
        break;

      case "ADEPresence":
        if (config.onADEPresence) {
          config.onADEPresence(message.arguments);
        }
        break;
    }
  };

  window.addEventListener("message", messageHandler);
  return messageHandler;
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
