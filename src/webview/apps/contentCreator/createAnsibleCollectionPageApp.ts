/* eslint-disable  @typescript-eslint/no-explicit-any */

import {
  AnsibleCollectionFormInterface,
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

let initNamespaceNameTextField: VscodeTextfield;
let initCollectionNameTextField: VscodeTextfield;

let namespaceInputField: HTMLInputElement;
let collectionInputField: HTMLInputElement;
let logFilePathInputField: HTMLInputElement;
let initPathUrlInputField: HTMLInputElement;

let initPathUrlTextField: VscodeTextfield;
let folderExplorerIcon: VscodeIcon;

let initCreateButton: VscodeButton;
let initClearButton: VscodeButton;

let overwriteCheckbox: VscodeCheckbox;
let editableModeInstall: VscodeCheckbox;

let logToFileCheckbox: VscodeCheckbox;
let logToFileOptionsDiv: HTMLElement | null;
let logFilePath: VscodeTextfield;
let fileExplorerButton: VscodeButton;
let logFileAppendCheckbox: VscodeCheckbox;
let logLevelDropdown: VscodeSingleSelect;

let verboseDropdown: VscodeSingleSelect;

let initCollectionNameDiv: HTMLElement | null;
let initCollectionPathDiv: HTMLElement | null;
let initCollectionNameElement: HTMLElement;
let initCollectionPathElement: HTMLElement;

let initLogsTextArea: VscodeTextarea;
let initClearLogsButton: VscodeButton;
let initOpenLogFileButton: VscodeButton;
let initCopyLogsButton: VscodeButton;
let initOpenScaffoldedFolderButton: VscodeButton;

let logFileUrl = "";
let collectionUrl = "";

function main() {
  // elements for init interface
  initNamespaceNameTextField = document.getElementById(
    "namespace-name",
  ) as VscodeTextfield;

  initCollectionNameTextField = document.getElementById(
    "collection-name",
  ) as VscodeTextfield;
  initPathUrlTextField = document.getElementById("path-url") as VscodeTextfield;
  folderExplorerIcon = document.getElementById("folder-explorer") as VscodeIcon;

  overwriteCheckbox = document.getElementById(
    "overwrite-checkbox",
  ) as VscodeCheckbox;
  editableModeInstall = document.getElementById(
    "editable-mode-checkbox",
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

  // Workaround for vscode-elements .value limitations for text fields
  namespaceInputField = initNamespaceNameTextField.shadowRoot?.querySelector(
    "#input",
  ) as HTMLInputElement;
  collectionInputField = initCollectionNameTextField.shadowRoot?.querySelector(
    "#input",
  ) as HTMLInputElement;
  logFilePathInputField = logFilePath.shadowRoot?.querySelector(
    "#input",
  ) as HTMLInputElement;
  initPathUrlInputField = initPathUrlTextField.shadowRoot?.querySelector(
    "#input",
  ) as HTMLInputElement;

  initNamespaceNameTextField.addEventListener("input", toggleCreateButton);
  initCollectionNameTextField.addEventListener("input", toggleCreateButton);
  initPathUrlTextField.addEventListener("input", toggleCreateButton);

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

  initCollectionNameDiv = document.getElementById("full-collection-name");
  initCollectionPathDiv = document.getElementById("full-collection-path");

  initCollectionNameElement = document.createElement("p");
  initCollectionNameElement.innerHTML = `namespace.collection`;
  initCollectionNameDiv?.appendChild(initCollectionNameElement);

  initCollectionPathElement = document.createElement("p");
  initCollectionPathElement.innerHTML =
    initPathUrlTextField.placeholder as string;
  initCollectionPathDiv?.appendChild(initCollectionPathElement);

  toggleEditableModeInstallCheckBox();
}

function openExplorer(event: any) {
  const source = event.target.id;

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
            initPathUrlInputField.value = selectedUri;
          } else {
            logFilePathInputField.value = selectedUri;
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
  namespaceInputField.value = "";
  collectionInputField.value = "";

  initPathUrlInputField.value = "";
  logFilePathInputField.value = "";

  initCollectionNameElement.innerHTML = "namespace.collection";

  overwriteCheckbox.checked = false;
  editableModeInstall.checked = false;
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
      namespaceName: initNamespaceNameTextField.value.trim(),
      collectionName: initCollectionNameTextField.value.trim(),
      initPath: initPathUrlTextField.value.trim(),
      verbosity: verboseDropdown.value.trim(),
      logToFile: logToFileCheckbox.checked,
      logFilePath: logFilePath.value.trim(),
      logFileAppend: logFileAppendCheckbox.checked,
      logLevel: logLevelDropdown.value.trim(),
      isOverwritten: overwriteCheckbox.checked,
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
