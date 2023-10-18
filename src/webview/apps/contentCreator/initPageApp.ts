import {
  allComponents,
  Button,
  Checkbox,
  TextArea,
  TextField,
  provideVSCodeDesignSystem,
  Dropdown,
} from "@vscode/webview-ui-toolkit";
import { AnsibleCreatorInitInterface } from "../../../features/contentCreator/types";

provideVSCodeDesignSystem().register(allComponents);

const vscode = acquireVsCodeApi();
window.addEventListener("load", main);

let initNamespaceNameTextField: TextField;
let initCollectionNameTextField: TextField;
let initPathUrlTextField: TextField;

let initCreateButton: Button;
let initClearButton: Button;

let forceCheckbox: Checkbox;

let logToFileCheckbox: Checkbox;
let logToFileOptionsDiv: HTMLElement | null;
let logFilePath: TextField;
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

let logFileUrl = "";

function main() {
  // elements for init interface
  initNamespaceNameTextField = document.getElementById(
    "namespace-name"
  ) as TextField;
  initCollectionNameTextField = document.getElementById(
    "collection-name"
  ) as TextField;
  initPathUrlTextField = document.getElementById("path-url") as TextField;
  forceCheckbox = document.getElementById("force-checkbox") as Checkbox;
  logToFileCheckbox = document.getElementById(
    "log-to-file-checkbox"
  ) as Checkbox;
  logToFileCheckbox.addEventListener("change", toggleLogToFileOptions);

  logToFileOptionsDiv = document.getElementById("log-to-file-options-div");

  logFilePath = document.getElementById("log-file-path") as TextField;
  logFileAppendCheckbox = document.getElementById(
    "log-file-append-checkbox"
  ) as Checkbox;
  logLevelDropdown = document.getElementById("log-level-dropdown") as Dropdown;

  verboseDropdown = document.getElementById("verbosity-dropdown") as Dropdown;
  initCreateButton = document.getElementById("create-button") as Button;
  initClearButton = document.getElementById("clear-button") as Button;

  initLogsTextArea = document.getElementById("log-text-area") as TextArea;
  initClearLogsButton = document.getElementById("clear-logs-button") as Button;
  initOpenLogFileButton = document.getElementById(
    "open-log-file-button"
  ) as Button;
  initCopyLogsButton = document.getElementById("copy-logs-button") as Button;

  initNamespaceNameTextField?.addEventListener("input", toggleCreateButton);
  initCollectionNameTextField?.addEventListener("input", toggleCreateButton);
  initPathUrlTextField?.addEventListener("input", toggleCreateButton);

  initCreateButton?.addEventListener("click", handleInitCreateClick);
  initCreateButton.disabled = true;

  initClearButton?.addEventListener("click", handleInitClearClick);

  initClearLogsButton?.addEventListener("click", handleInitClearLogsClick);
  initOpenLogFileButton?.addEventListener("click", handleInitOpenLogFileClick);
  initCopyLogsButton?.addEventListener("click", handleInitCopyLogsClick);

  initCollectionNameDiv = document.getElementById("full-collection-name");
  initCollectionPathDiv = document.getElementById("full-collection-path");

  initCollectionNameElement = document.createElement("p");
  initCollectionNameElement.innerHTML = `namespace.collection`;
  initCollectionNameDiv?.appendChild(initCollectionNameElement);

  initCollectionPathElement = document.createElement("p");
  initCollectionPathElement.innerHTML = initPathUrlTextField.placeholder;
  initCollectionPathDiv?.appendChild(initCollectionPathElement);
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

  //   update collection path <p> tag
  if (!initPathUrlTextField.value.trim()) {
    initCollectionPathElement.innerHTML = `${
      initPathUrlTextField.placeholder
    }/${initNamespaceNameTextField.value.trim()}/${initCollectionNameTextField.value.trim()}`;

    if (
      !initNamespaceNameTextField.value.trim() &&
      !initCollectionNameTextField.value.trim()
    ) {
      initCollectionPathElement.innerHTML = initPathUrlTextField.placeholder;
    }
  } else {
    initCollectionPathElement.innerHTML = ` ${initPathUrlTextField.value.trim()}/${initNamespaceNameTextField.value.trim()}/${initCollectionNameTextField.value.trim()}`;
    initCollectionPathElement.innerHTML = ` ${initPathUrlTextField.value.trim()}/${initNamespaceNameTextField.value.trim()}/${initCollectionNameTextField.value.trim()}`;
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

function handleInitClearClick() {
  initNamespaceNameTextField.value = "";
  initCollectionNameTextField.value = "";
  initPathUrlTextField.value = "";

  initCollectionNameElement.innerHTML = "namespace.collection";
  initCollectionPathElement.innerHTML = initPathUrlTextField.placeholder;

  forceCheckbox.checked = false;
  verboseDropdown.currentValue = "Off";

  initCreateButton.disabled = true;
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
  const fullCollectionName = `${initNamespaceNameTextField.value.trim()}.${initCollectionNameTextField.value.trim()}`;
  let commandString: string = `Command: $ ansible-creator init ${fullCollectionName} --init-path ${initPathUrlTextField.value.trim()}`;
  if (forceCheckbox.checked) {
    commandString = commandString + " --force";
  }

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
    } as AnsibleCreatorInitInterface,
  });

  window.addEventListener("message", (event) => {
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

        break;
    }
  });
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
