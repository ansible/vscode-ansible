/* eslint-disable  @typescript-eslint/no-explicit-any */

import {
  AnsibleProjectFormInterface,
  PostMessageEvent,
} from "../../../features/contentCreator/types";
import "@vscode-elements/elements";
import {
  VscodeButton,
  VscodeCheckbox,
  VscodeIcon,
  VscodeSingleSelect,
  VscodeTextarea,
  VscodeTextfield,
} from "@vscode-elements/elements";

const vscode = acquireVsCodeApi();
window.addEventListener("load", main);

let destinationPathUrlTextField: VscodeTextfield;
let folderExplorerIcon: VscodeIcon;

let namespaceNameTextField: VscodeTextfield;
let collectionNameTextField: VscodeTextfield;

let initCreateButton: VscodeButton;
let initClearButton: VscodeButton;

let overwriteCheckbox: VscodeCheckbox;

let logToFileCheckbox: VscodeCheckbox;
let logToFileOptionsDiv: HTMLElement | null;
let logFilePath: VscodeTextfield;
let fileExplorerButton: VscodeButton;
let logFileAppendCheckbox: VscodeCheckbox;
let logLevelDropdown: VscodeSingleSelect;

let verboseDropdown: VscodeSingleSelect;

let initCollectionPathDiv: HTMLElement | null;
let initCollectionPathElement: HTMLElement;

let initLogsTextArea: VscodeTextarea;
let initClearLogsButton: VscodeButton;
let initOpenLogFileButton: VscodeButton;
let initCopyLogsButton: VscodeButton;
let initOpenScaffoldedFolderButton: VscodeButton;

let logFileUrl = "";
let projectUrl = "";

function main() {
  // elements for scaffold ansible project interface
  destinationPathUrlTextField = document.getElementById(
    "path-url",
  ) as VscodeTextfield;
  folderExplorerIcon = document.getElementById("folder-explorer") as VscodeIcon;

  namespaceNameTextField = document.getElementById(
    "namespace-name",
  ) as VscodeTextfield;
  collectionNameTextField = document.getElementById(
    "collection-name",
  ) as VscodeTextfield;

  overwriteCheckbox = document.getElementById(
    "overwrite-checkbox",
  ) as VscodeCheckbox;

  logToFileCheckbox = document.getElementById(
    "log-to-file-checkbox",
  ) as VscodeCheckbox;
  logToFileCheckbox.addEventListener("change", toggleLogToFileOptions);

  logToFileOptionsDiv = document.getElementById("log-to-file-options-div");

  logFilePath = document.getElementById("log-file-path") as VscodeTextfield;
  fileExplorerButton = document.getElementById("file-explorer") as VscodeButton;
  logFileAppendCheckbox = document.getElementById(
    "log-file-append-checkbox",
  ) as VscodeCheckbox;
  logLevelDropdown = document.getElementById(
    "log-level-dropdown",
  ) as VscodeSingleSelect;

  verboseDropdown = document.getElementById(
    "verbosity-dropdown",
  ) as VscodeSingleSelect;
  initCreateButton = document.getElementById("create-button") as VscodeButton;
  initClearButton = document.getElementById("clear-button") as VscodeButton;

  initLogsTextArea = document.getElementById("log-text-area") as VscodeTextarea;
  initClearLogsButton = document.getElementById(
    "clear-logs-button",
  ) as VscodeButton;
  initOpenLogFileButton = document.getElementById(
    "open-log-file-button",
  ) as VscodeButton;
  initCopyLogsButton = document.getElementById(
    "copy-logs-button",
  ) as VscodeButton;
  initOpenScaffoldedFolderButton = document.getElementById(
    "open-folder-button",
  ) as VscodeButton;

  destinationPathUrlTextField.addEventListener("input", toggleCreateButton);
  namespaceNameTextField.addEventListener("input", toggleCreateButton);
  collectionNameTextField.addEventListener("input", toggleCreateButton);

  folderExplorerIcon.addEventListener("click", openExplorer);
  fileExplorerButton.addEventListener("click", openExplorer);

  initCreateButton.addEventListener("click", handleInitCreateClick);
  initCreateButton.disabled = true;

  initClearButton.addEventListener("click", handleInitClearClick);

  initClearLogsButton.addEventListener("click", handleInitClearLogsClick);
  initOpenLogFileButton.addEventListener("click", handleInitOpenLogFileClick);
  initCopyLogsButton.addEventListener("click", handleInitCopyLogsClick);
  initOpenScaffoldedFolderButton.addEventListener(
    "click",
    handleInitOpenScaffoldedFolderClick,
  );

  initCollectionPathDiv = document.getElementById("full-collection-path");

  initCollectionPathElement = document.createElement("p");
  initCollectionPathElement.innerHTML =
    destinationPathUrlTextField.placeholder as string;
  initCollectionPathDiv?.appendChild(initCollectionPathElement);
}

let Source = "";
function openExplorer(event: any) {
  Source = event.target.id;
  const selectOption = Source === "folder-explorer" ? "folder" : "file";
  vscode.postMessage({
    command: "open-explorer",
    payload: { selectOption },
  });
}
window.addEventListener("message", (event: MessageEvent<PostMessageEvent>) => {
  const message = event.data;
  if (message.command === "file-uri") {
    const selectedUri = message.arguments.selectedUri;
    if (selectedUri) {
      if (Source === "folder-explorer") {
        destinationPathUrlTextField.value = selectedUri;
        initCollectionPathElement.innerHTML = selectedUri;
      } else if (Source === "file-explorer") {
        logFilePath.value = selectedUri;
      }
    }
  }
});

function toggleCreateButton() {
  //   update collection path <p> tag
  if (!destinationPathUrlTextField.value.trim()) {
    initCollectionPathElement.innerHTML = `${
      destinationPathUrlTextField.placeholder
    }/${namespaceNameTextField.value.trim()}-${collectionNameTextField.value.trim()}`;

    if (
      !namespaceNameTextField.value.trim() ||
      !collectionNameTextField.value.trim()
    ) {
      initCollectionPathElement.innerHTML =
        destinationPathUrlTextField.placeholder as string;
    }
  } else {
    initCollectionPathElement.innerHTML =
      destinationPathUrlTextField.value.trim();
  }

  if (
    namespaceNameTextField.value.trim() &&
    collectionNameTextField.value.trim()
  ) {
    initCreateButton.disabled = false;
  } else {
    initCreateButton.disabled = true;
  }
}

function handleInitClearClick() {
  namespaceNameTextField.value = "";
  collectionNameTextField.value = "";
  destinationPathUrlTextField.value = "";
  logFilePath.value = "";

  initCollectionPathElement.innerHTML =
    destinationPathUrlTextField.placeholder as string;

  overwriteCheckbox.checked = false;
  verboseDropdown.value = "Off";

  initCreateButton.disabled = true;

  if (logToFileOptionsDiv?.style.display === "flex") {
    logToFileOptionsDiv.style.display = "none";
  }

  logToFileCheckbox.checked = false;
  logFileAppendCheckbox.checked = false;
  logLevelDropdown.value = "Debug";
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
      namespaceName: namespaceNameTextField.value.trim(),
      collectionName: collectionNameTextField.value.trim(),
      verbosity: verboseDropdown.value.trim(),
      logToFile: logToFileCheckbox.checked,
      logFilePath: logFilePath.value.trim(),
      logFileAppend: logFileAppendCheckbox.checked,
      logLevel: logLevelDropdown.value.trim(),
      isOverwritten: overwriteCheckbox.checked,
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
