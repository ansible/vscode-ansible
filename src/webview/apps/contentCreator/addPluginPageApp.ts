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
  PluginFormInterface,
  PostMessageEvent,
} from "../../../features/contentCreator/types";

provideVSCodeDesignSystem().register(allComponents);

const vscode = acquireVsCodeApi();
window.addEventListener("load", main);

let pluginNameTextField: TextField;
let pluginTypeDropdown: Dropdown;

let collectionPathUrlTextField: TextField;
let folderExplorerButton: Button;

let initCreateButton: Button;
let initClearButton: Button;

let overwriteCheckbox: Checkbox;

let verboseDropdown: Dropdown;

let initCollectionPathDiv: HTMLElement | null;
let initCollectionPathElement: HTMLElement;

let initLogsTextArea: TextArea;
let initClearLogsButton: Button;
let initOpenScaffoldedFolderButton: Button;

let projectUrl = "";

function main() {
  // elements for scaffolding ansible plugin interface
  pluginNameTextField = document.getElementById("plugin-name") as TextField;
  pluginTypeDropdown = document.getElementById("plugin-dropdown") as Dropdown;

  collectionPathUrlTextField = document.getElementById("path-url") as TextField;
  folderExplorerButton = document.getElementById("folder-explorer") as Button;

  overwriteCheckbox = document.getElementById("overwrite-checkbox") as Checkbox;

  verboseDropdown = document.getElementById("verbosity-dropdown") as Dropdown;
  initCreateButton = document.getElementById("create-button") as Button;
  initClearButton = document.getElementById("clear-button") as Button;

  initLogsTextArea = document.getElementById("log-text-area") as TextArea;
  initClearLogsButton = document.getElementById("clear-logs-button") as Button;
  initOpenScaffoldedFolderButton = document.getElementById(
    "open-folder-button",
  ) as Button;

  pluginNameTextField.addEventListener("input", toggleCreateButton);
  collectionPathUrlTextField.addEventListener("input", toggleCreateButton);

  folderExplorerButton.addEventListener("click", openExplorer);

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
  initCollectionPathElement.innerHTML = collectionPathUrlTextField.placeholder;
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
  pluginTypeDropdown.currentValue = "filter";
  collectionPathUrlTextField.value = "";

  initCollectionPathElement.innerHTML = collectionPathUrlTextField.placeholder;

  overwriteCheckbox.checked = false;
  verboseDropdown.currentValue = "Off";

  initCreateButton.disabled = true;
}

function toggleCreateButton() {
  //   update collection path <p> tag
  if (!collectionPathUrlTextField.value.trim()) {
    initCollectionPathElement.innerHTML = `${
      collectionPathUrlTextField.placeholder
    }/plugins/${pluginTypeDropdown.currentValue.trim()}/${pluginNameTextField.value.trim()}`;

    if (!pluginNameTextField.value.trim()) {
      initCollectionPathElement.innerHTML =
        collectionPathUrlTextField.placeholder;
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
      pluginType: pluginTypeDropdown.currentValue.trim(),
      collectionPath: collectionPathUrlTextField.value.trim(),
      verbosity: verboseDropdown.currentValue.trim(),
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
    },
  });
}
