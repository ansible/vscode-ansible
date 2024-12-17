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
  AnsibleSampleExecutionEnvInterface,
  PostMessageEvent,
} from "../../../features/contentCreator/types";

provideVSCodeDesignSystem().register(allComponents);

const vscode = acquireVsCodeApi();
window.addEventListener("load", main);

let destinationPathUrlTextField: TextField;
let folderExplorerButton: Button;

let initCreateButton: Button;
let initClearButton: Button;

let overwriteCheckbox: Checkbox;

let logToFileCheckbox: Checkbox;
let logToFileOptionsDiv: HTMLElement | null;
let logFilePath: TextField;
let fileExplorerButton: Button;
let logFileAppendCheckbox: Checkbox;
let logLevelDropdown: Dropdown;

let verboseDropdown: Dropdown;

let initDestinationPathDiv: HTMLElement | null;
let initDestinationPathElement: HTMLElement;

let initLogsTextArea: TextArea;
let initClearLogsButton: Button;
let initOpenLogFileButton: Button;
let initCopyLogsButton: Button;
let initOpenScaffoldedFileButton: Button;

let logFileUrl = "";
let projectUrl = "";

function main() {
  destinationPathUrlTextField = document.getElementById(
    "path-url",
  ) as TextField;
  folderExplorerButton = document.getElementById("folder-explorer") as Button;

  overwriteCheckbox = document.getElementById("overwrite-checkbox") as Checkbox;

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
  initOpenScaffoldedFileButton = document.getElementById(
    "open-file-button",
  ) as Button;

  destinationPathUrlTextField.addEventListener("input", toggleCreateButton);

  folderExplorerButton.addEventListener("click", openExplorer);
  fileExplorerButton.addEventListener("click", openExplorer);

  initCreateButton.addEventListener("click", handleInitCreateClick);
  initCreateButton.disabled = false;

  initClearButton.addEventListener("click", handleInitClearClick);

  initClearLogsButton.addEventListener("click", handleInitClearLogsClick);
  initOpenLogFileButton.addEventListener("click", handleInitOpenLogFileClick);
  initCopyLogsButton.addEventListener("click", handleInitCopyLogsClick);
  initOpenScaffoldedFileButton.addEventListener(
    "click",
    handleInitOpenScaffoldedFileClick,
  );

  initDestinationPathDiv = document.getElementById("full-destination-path");

  initDestinationPathElement = document.createElement("p");
  initDestinationPathElement.innerHTML =
    destinationPathUrlTextField.placeholder;
  initDestinationPathDiv?.appendChild(initDestinationPathElement);
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
            destinationPathUrlTextField.value = selectedUri;
            initDestinationPathElement.innerHTML = selectedUri;
          } else {
            logFilePath.value = selectedUri;
          }
        }
      }
    },
  );
}

function handleInitClearClick() {
  destinationPathUrlTextField.value = "";

  initDestinationPathElement.innerHTML =
    destinationPathUrlTextField.placeholder;

  overwriteCheckbox.checked = false;
  verboseDropdown.currentValue = "Off";

  initCreateButton.disabled = false;

  logToFileCheckbox.checked = false;
  logFilePath.value = "";
  logFileAppendCheckbox.checked = false;
  logLevelDropdown.currentValue = "Debug";
  initOpenScaffoldedFileButton.disabled = true;
}

function toggleCreateButton() {
  //   update destination path <p> tag
  initDestinationPathElement.innerHTML =
    destinationPathUrlTextField.value.trim();

  initCreateButton.disabled = false;
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
  initCreateButton.disabled = false;

  vscode.postMessage({
    command: "init-create",
    payload: {
      destinationPath: destinationPathUrlTextField.value.trim(),
      verbosity: verboseDropdown.currentValue.trim(),
      logToFile: logToFileCheckbox.checked,
      logFilePath: logFilePath.value.trim(),
      logFileAppend: logFileAppendCheckbox.checked,
      logLevel: logLevelDropdown.currentValue.trim(),
      isOverwritten: overwriteCheckbox.checked,
    } as AnsibleSampleExecutionEnvInterface,
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
            initOpenScaffoldedFileButton.disabled = false;
          } else {
            initOpenScaffoldedFileButton.disabled = true;
          }

          projectUrl = message.arguments.projectUrl
            ? message.arguments.projectUrl
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

function handleInitOpenScaffoldedFileClick() {
  vscode.postMessage({
    command: "init-open-scaffolded-file",
    payload: {
      projectUrl: projectUrl,
    },
  });
}
