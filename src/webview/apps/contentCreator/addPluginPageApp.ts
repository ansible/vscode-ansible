/* eslint-disable  @typescript-eslint/no-explicit-any */

import {
  PluginFormInterface,
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

let pluginNameTextField: VscodeTextfield;
let pluginTypeDropdown: VscodeSingleSelect;

let collectionPathUrlTextField: VscodeTextfield;
let folderExplorerIcon: VscodeIcon;

let initCreateButton: VscodeButton;
let initClearButton: VscodeButton;

let overwriteCheckbox: VscodeCheckbox;

let verboseDropdown: VscodeSingleSelect;

let initCollectionPathDiv: HTMLElement | null;
let initCollectionPathElement: HTMLElement;

let initLogsTextArea: VscodeTextarea;
let initClearLogsButton: VscodeButton;
let initOpenScaffoldedFolderButton: VscodeButton;

let projectUrl = "";

function main() {
  // elements for scaffolding ansible plugin interface
  pluginNameTextField = document.getElementById(
    "plugin-name",
  ) as VscodeTextfield;
  pluginTypeDropdown = document.getElementById(
    "plugin-dropdown",
  ) as VscodeSingleSelect;

  collectionPathUrlTextField = document.getElementById(
    "path-url",
  ) as VscodeTextfield;
  folderExplorerIcon = document.getElementById("folder-explorer") as VscodeIcon;

  overwriteCheckbox = document.getElementById(
    "overwrite-checkbox",
  ) as VscodeCheckbox;

  verboseDropdown = document.getElementById(
    "verbosity-dropdown",
  ) as VscodeSingleSelect;
  initCreateButton = document.getElementById("create-button") as VscodeButton;
  initClearButton = document.getElementById("clear-button") as VscodeButton;

  initLogsTextArea = document.getElementById("log-text-area") as VscodeTextarea;
  initClearLogsButton = document.getElementById(
    "clear-logs-button",
  ) as VscodeButton;
  initOpenScaffoldedFolderButton = document.getElementById(
    "open-folder-button",
  ) as VscodeButton;

  pluginNameTextField.addEventListener("input", toggleCreateButton);
  collectionPathUrlTextField.addEventListener("input", toggleCreateButton);

  folderExplorerIcon.addEventListener("click", openExplorer);

  initCreateButton.addEventListener("click", handleInitCreateClick);
  initCreateButton.disabled = true;

  initClearButton.addEventListener("click", handleInitClearClick);

  initClearLogsButton.addEventListener("click", handleInitClearLogsClick);
  initOpenScaffoldedFolderButton.addEventListener(
    "click",
    handleInitOpenScaffoldedFolderClick,
  );

  initCollectionPathDiv = document.getElementById("full-collection-path");

  initCollectionPathElement = document.createElement("p");
  initCollectionPathElement.innerHTML =
    collectionPathUrlTextField.placeholder as string;
  initCollectionPathDiv?.appendChild(initCollectionPathElement);
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
            collectionPathUrlTextField.value = selectedUri;
            initCollectionPathElement.innerHTML = selectedUri;
          }
        }
      }
    },
  );
}

function handleInitClearClick() {
  pluginNameTextField.value = "";
  pluginTypeDropdown.value = "filter";
  collectionPathUrlTextField.value = "";

  initCollectionPathElement.innerHTML =
    collectionPathUrlTextField.placeholder as string;

  overwriteCheckbox.checked = false;
  verboseDropdown.value = "Off";

  initCreateButton.disabled = true;
}

function toggleCreateButton() {
  //   update collection path <p> tag
  if (!collectionPathUrlTextField.value.trim()) {
    initCollectionPathElement.innerHTML = `${
      collectionPathUrlTextField.placeholder
    }/plugins/${pluginTypeDropdown.value.trim()}/${pluginNameTextField.value.trim()}`;

    if (!pluginNameTextField.value.trim()) {
      initCollectionPathElement.innerHTML =
        collectionPathUrlTextField.placeholder as string;
    }
  } else {
    initCollectionPathElement.innerHTML =
      collectionPathUrlTextField.value.trim();
  }

  if (pluginNameTextField.value.trim()) {
    initCreateButton.disabled = false;
  } else {
    initCreateButton.disabled = true;
  }
}

function handleInitCreateClick() {
  initCreateButton.disabled = true;

  vscode.postMessage({
    command: "init-create",
    payload: {
      pluginName: pluginNameTextField.value.trim(),
      pluginType: pluginTypeDropdown.value.trim(),
      collectionPath: collectionPathUrlTextField.value.trim(),
      verbosity: verboseDropdown.value.trim(),
      isOverwritten: overwriteCheckbox.checked,
    } as PluginFormInterface,
  });

  window.addEventListener(
    "message",
    async (event: MessageEvent<PostMessageEvent>) => {
      const message = event.data;

      switch (message.command) {
        case "execution-log":
          initLogsTextArea.value = message.arguments.commandOutput;
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

function handleInitOpenScaffoldedFolderClick() {
  vscode.postMessage({
    command: "init-open-scaffolded-folder",
    payload: {
      projectUrl: projectUrl,
      pluginName: pluginNameTextField.value.trim(),
      pluginType: pluginTypeDropdown.value.trim(),
    },
  });
}
