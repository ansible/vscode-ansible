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
  AnsibleProjectFormInterface,
  PostMessageEvent,
} from "../../../features/contentCreator/types";

provideVSCodeDesignSystem().register(allComponents);

const vscode = acquireVsCodeApi();
window.addEventListener("load", main);

let destinationPathUrlTextField: TextField;
let folderExplorerButton: Button;

let scmOrgNameTextField: TextField;
let scmProjectNameTextField: TextField;

let initCreateButton: Button;
let initClearButton: Button;

let forceCheckbox: Checkbox;

let logToFileCheckbox: Checkbox;
let logToFileOptionsDiv: HTMLElement | null;
let logFilePath: TextField;
let fileExplorerButton: Button;
let logFileAppendCheckbox: Checkbox;
let logLevelDropdown: Dropdown;

let verboseDropdown: Dropdown;

let initCollectionPathDiv: HTMLElement | null;
let initCollectionPathElement: HTMLElement;

let initLogsTextArea: TextArea;
let initClearLogsButton: Button;
let initOpenLogFileButton: Button;
let initCopyLogsButton: Button;
let initOpenScaffoldedFolderButton: Button;

let logFileUrl = "";
let projectUrl = "";

function main() {
  // elements for scaffold ansible project interface
  // projectNameTextField = document.getElementById("project-name") as TextField;
  destinationPathUrlTextField = document.getElementById(
    "path-url",
  ) as TextField;
  folderExplorerButton = document.getElementById("folder-explorer") as Button;

  scmOrgNameTextField = document.getElementById("scm-org-name") as TextField;
  scmProjectNameTextField = document.getElementById(
    "scm-project-name",
  ) as TextField;

  forceCheckbox = document.getElementById("force-checkbox") as Checkbox;

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

  // projectNameTextField?.addEventListener("input", toggleCreateButton);
  destinationPathUrlTextField?.addEventListener("input", toggleCreateButton);
  scmOrgNameTextField?.addEventListener("input", toggleCreateButton);
  scmProjectNameTextField?.addEventListener("input", toggleCreateButton);

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

  initCollectionPathDiv = document.getElementById("full-collection-path");

  initCollectionPathElement = document.createElement("p");
  initCollectionPathElement.innerHTML = destinationPathUrlTextField.placeholder;
  initCollectionPathDiv?.appendChild(initCollectionPathElement);
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
            initCollectionPathElement.innerHTML = selectedUri;
          } else {
            logFilePath.value = selectedUri;
          }
        }
      }
    },
  );
}

function toggleCreateButton() {
  //   update collection path <p> tag
  if (!destinationPathUrlTextField.value.trim()) {
    initCollectionPathElement.innerHTML = `${
      destinationPathUrlTextField.placeholder
    }/${scmOrgNameTextField.value.trim()}-${scmProjectNameTextField.value.trim()}`;

    if (
      !scmOrgNameTextField.value.trim() ||
      !scmProjectNameTextField.value.trim()
    ) {
      initCollectionPathElement.innerHTML =
        destinationPathUrlTextField.placeholder;
    }
  } else {
    initCollectionPathElement.innerHTML =
      destinationPathUrlTextField.value.trim();
  }

  if (
    scmOrgNameTextField.value.trim() &&
    scmProjectNameTextField.value.trim()
  ) {
    initCreateButton.disabled = false;
  } else {
    initCreateButton.disabled = true;
  }
}

function handleInitClearClick() {
  // projectNameTextField.value = "";
  destinationPathUrlTextField.value = "";
  scmOrgNameTextField.value = "";
  scmProjectNameTextField.value = "";

  initCollectionPathElement.innerHTML = destinationPathUrlTextField.placeholder;

  forceCheckbox.checked = false;
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
      // projectName: projectNameTextField.value.trim(),
      destinationPath: destinationPathUrlTextField.value.trim(),
      scmOrgName: scmOrgNameTextField.value.trim(),
      scmProjectName: scmProjectNameTextField.value.trim(),
      verbosity: verboseDropdown.currentValue.trim(),
      logToFile: logToFileCheckbox.checked,
      logFilePath: logFilePath.value.trim(),
      logFileAppend: logFileAppendCheckbox.checked,
      logLevel: logLevelDropdown.currentValue.trim(),
      isForced: forceCheckbox.checked,
    } as AnsibleProjectFormInterface,
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

function handleInitOpenScaffoldedFolderClick() {
  vscode.postMessage({
    command: "init-open-scaffolded-folder",
    payload: {
      projectUrl: projectUrl,
    },
  });
}
