/* eslint-disable  @typescript-eslint/no-explicit-any */

import {
  allComponents,
  Button,
  Checkbox,
  TextArea,
  TextField,
  provideVSCodeDesignSystem,
  Dropdown,
} from "@vscode/webview-ui-toolkit";
import {
  AnsibleCollectionFormInterface,
  PostMessageEvent,
} from "../../../features/contentCreator/types";

provideVSCodeDesignSystem().register(allComponents);

const vscode = acquireVsCodeApi();
window.addEventListener("load", main);

let initNamespaceNameTextField: TextField;
let initCollectionNameTextField: TextField;
let initPathUrlTextField: TextField;
let folderExplorerButton: Button;

let initCreateButton: Button;
let initClearButton: Button;

let forceCheckbox: Checkbox;
let editableModeInstall: Checkbox;

let logToFileCheckbox: Checkbox;
let logToFileOptionsDiv: HTMLElement | null;
let logFilePath: TextField;
let fileExplorerButton: Button;
let logFileAppendCheckbox: Checkbox;
let logLevelDropdown: Dropdown;

let verboseDropdown: Dropdown;

let initCollectionNameDiv: HTMLElement | null;
let initCollectionPathDiv: HTMLElement | null;
let initCollectionNameElement: HTMLElement;
let initCollectionPathElement: HTMLElement;

let initLogsTextArea: TextArea;
let initClearLogsButton: Button;
let initOpenLogFileButton: Button;
let initCopyLogsButton: Button;
let initOpenScaffoldedFolderButton: Button;

let logFileUrl = "";
let collectionUrl = "";

function main() {
  // elements for init interface
  initNamespaceNameTextField = document.getElementById(
    "namespace-name",
  ) as TextField;
  initCollectionNameTextField = document.getElementById(
    "collection-name",
  ) as TextField;
  initPathUrlTextField = document.getElementById("path-url") as TextField;
  folderExplorerButton = document.getElementById("folder-explorer") as Button;

  forceCheckbox = document.getElementById("force-checkbox") as Checkbox;
  editableModeInstall = document.getElementById(
    "editable-mode-checkbox",
  ) as Checkbox;
  logToFileCheckbox = document.getElementById(
    "log-to-file-checkbox",
  ) as Checkbox;
  logToFileCheckbox.addEventListener("change", toggleLogToFileOptions);

  logToFileOptionsDiv = document.getElementById("log-to-file-options-div");

  logFilePath = document.getElementById("log-file-path") as TextField;
  fileExplorerButton = document.getElementById("file-explorer") as Button;
  logFileAppendCheckbox = document.getElementById(
    "log-file-append-checkbox",
  ) as Checkbox;
  logLevelDropdown = document.getElementById("log-level-dropdown") as Dropdown;

  verboseDropdown = document.getElementById("verbosity-dropdown") as Dropdown;
  initCreateButton = document.getElementById("create-button") as Button;
  initClearButton = document.getElementById("clear-button") as Button;

  initLogsTextArea = document.getElementById("log-text-area") as TextArea;
  initClearLogsButton = document.getElementById("clear-logs-button") as Button;
  initOpenLogFileButton = document.getElementById(
    "open-log-file-button",
  ) as Button;
  initCopyLogsButton = document.getElementById("copy-logs-button") as Button;
  initOpenScaffoldedFolderButton = document.getElementById(
    "open-folder-button",
  ) as Button;

  initNamespaceNameTextField?.addEventListener("input", toggleCreateButton);
  initCollectionNameTextField?.addEventListener("input", toggleCreateButton);
  initPathUrlTextField?.addEventListener("input", toggleCreateButton);

  folderExplorerButton.addEventListener("click", openExplorer);
  fileExplorerButton.addEventListener("click", openExplorer);

  initCreateButton?.addEventListener("click", handleInitCreateClick);
  initCreateButton.disabled = true;

  initClearButton?.addEventListener("click", handleInitClearClick);

  initClearLogsButton?.addEventListener("click", handleInitClearLogsClick);
  initOpenLogFileButton?.addEventListener("click", handleInitOpenLogFileClick);
  initCopyLogsButton?.addEventListener("click", handleInitCopyLogsClick);
  initOpenScaffoldedFolderButton?.addEventListener(
    "click",
    handleInitOpenScaffoldedFolderClick,
  );

  initCollectionNameDiv = document.getElementById("full-collection-name");
  initCollectionPathDiv = document.getElementById("full-collection-path");

  initCollectionNameElement = document.createElement("p");
  initCollectionNameElement.innerHTML = `namespace.collection`;
  initCollectionNameDiv?.appendChild(initCollectionNameElement);

  initCollectionPathElement = document.createElement("p");
  initCollectionPathElement.innerHTML = initPathUrlTextField.placeholder;
  initCollectionPathDiv?.appendChild(initCollectionPathElement);

  toggleEditableModeInstallCheckBox();
}

function openExplorer(event: any) {
  const source = event.target.parentNode.id;

  let selectOption;

  if (source === "folder-explorer") {
    selectOption = "folder";
  } else {
    selectOption = "file";
  }

  vscode.postMessage({
    command: "open-explorer",
    payload: {
      selectOption: selectOption,
    },
  });

  window.addEventListener(
    "message",
    (event: MessageEvent<PostMessageEvent>) => {
      const message = event.data;

      if (message.command === "file-uri") {
        const selectedUri = message.arguments.selectedUri;

        if (selectedUri) {
          if (source === "folder-explorer") {
            initPathUrlTextField.value = selectedUri;
          } else {
            logFilePath.value = selectedUri;
          }
        }
      }
    },
  );
}

function toggleCreateButton() {
  //   update collection name <p> tag
  if (
    !initNamespaceNameTextField.value.trim() &&
    !initCollectionNameTextField.value.trim()
  ) {
    initCollectionNameElement.innerHTML = "namespace.collection";
  } else {
    initCollectionNameElement.innerHTML = `${initNamespaceNameTextField.value.trim()}.${initCollectionNameTextField.value.trim()}`;
  }

  if (
    initNamespaceNameTextField.value.trim() &&
    initCollectionNameTextField.value.trim()
  ) {
    initCreateButton.disabled = false;
  } else {
    initCreateButton.disabled = true;
  }
}

function toggleEditableModeInstallCheckBox() {
  vscode.postMessage({
    command: "check-ade-presence",
  });

  window.addEventListener(
    "message",
    (event: MessageEvent<PostMessageEvent>) => {
      const message = event.data; // The JSON data our extension sent

      if (message.command === "ADEPresence") {
        if (message.arguments) {
          editableModeInstall.disabled = false;
        } else {
          editableModeInstall.disabled = true;
        }
      }
    },
  );
}

function handleInitClearClick() {
  initNamespaceNameTextField.value = "";
  initCollectionNameTextField.value = "";
  initPathUrlTextField.value = "";

  initCollectionNameElement.innerHTML = "namespace.collection";

  forceCheckbox.checked = false;
  editableModeInstall.checked = false;
  verboseDropdown.currentValue = "Off";

  initCreateButton.disabled = true;

  logToFileCheckbox.checked = false;
  logFilePath.value = "";
  logFileAppendCheckbox.checked = false;
  logLevelDropdown.currentValue = "Debug";
}

function toggleLogToFileOptions() {
  if (logToFileCheckbox.checked) {
    if (
      logToFileOptionsDiv?.style.display === "" ||
      logToFileOptionsDiv?.style.display === "none"
    ) {
      logToFileOptionsDiv.style.display = "flex";
    }
  } else {
    if (logToFileOptionsDiv?.style.display === "flex") {
      logToFileOptionsDiv.style.display = "none";
    }
  }
}

function handleInitCreateClick() {
  initCreateButton.disabled = true;

  vscode.postMessage({
    command: "init-create",
    payload: {
      namespaceName: initNamespaceNameTextField.value.trim(),
      collectionName: initCollectionNameTextField.value.trim(),
      initPath: initPathUrlTextField.value.trim(),
      verbosity: verboseDropdown.currentValue.trim(),
      logToFile: logToFileCheckbox.checked,
      logFilePath: logFilePath.value.trim(),
      logFileAppend: logFileAppendCheckbox.checked,
      logLevel: logLevelDropdown.currentValue.trim(),
      isForced: forceCheckbox.checked,
      isEditableModeInstall: editableModeInstall.checked,
    } as AnsibleCollectionFormInterface,
  });

  window.addEventListener(
    "message",
    async (event: MessageEvent<PostMessageEvent>) => {
      const message = event.data;

      switch (message.command) {
        case "execution-log":
          initLogsTextArea.value = message.arguments.commandOutput;
          logFileUrl = message.arguments.logFileUrl;

          if (logFileUrl) {
            initOpenLogFileButton.disabled = false;
          } else {
            initOpenLogFileButton.disabled = true;
          }

          if (
            message.arguments.status &&
            message.arguments.status === "passed"
          ) {
            initOpenScaffoldedFolderButton.disabled = false;
          } else {
            initOpenScaffoldedFolderButton.disabled = true;
          }

          collectionUrl = message.arguments.collectionUrl
            ? message.arguments.collectionUrl
            : "";

          initCreateButton.disabled = false;

          return;
      }
    },
  );
}

function handleInitClearLogsClick() {
  initLogsTextArea.value = "";
}

function handleInitOpenLogFileClick() {
  vscode.postMessage({
    command: "init-open-log-file",
    payload: {
      logFileUrl: logFileUrl,
    },
  });
}

function handleInitCopyLogsClick() {
  vscode.postMessage({
    command: "init-copy-logs",
    payload: {
      initExecutionLogs: initLogsTextArea.value,
    },
  });
}

function handleInitOpenScaffoldedFolderClick() {
  vscode.postMessage({
    command: "init-open-scaffolded-folder",
    payload: {
      collectionUrl: collectionUrl,
    },
  });
}
