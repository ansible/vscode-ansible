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
  DevfileFormInterface,
  PostMessageEvent,
} from "../../../features/contentCreator/types";

provideVSCodeDesignSystem().register(allComponents);

const vscode = acquireVsCodeApi();
window.addEventListener("load", main);

let destinationPathUrlTextField: TextField;
let folderExplorerButton: Button;

let devfileNameTextField: TextField;

let devfileCreateButton: Button;
let devfileClearButton: Button;

let devfileClearLogsButton: Button;

let overwriteCheckbox: Checkbox;

let imageDropdown: Dropdown;

let devfilePathDiv: HTMLElement | null;
let devfilePathElement: HTMLElement;

let devfileLogsTextArea: TextArea;
let devfileOpenScaffoldedFolderButton: Button;

let projectUrl = "";

function main() {
  destinationPathUrlTextField = document.getElementById(
    "path-url",
  ) as TextField;
  folderExplorerButton = document.getElementById("folder-explorer") as Button;

  devfileNameTextField = document.getElementById("devfile-name") as TextField;

  overwriteCheckbox = document.getElementById("overwrite-checkbox") as Checkbox;

  imageDropdown = document.getElementById("image-dropdown") as Dropdown;
  devfileCreateButton = document.getElementById("create-button") as Button;
  devfileClearButton = document.getElementById("reset-button") as Button;

  devfileLogsTextArea = document.getElementById("log-text-area") as TextArea;

  devfileClearLogsButton = document.getElementById(
    "clear-logs-button",
  ) as Button;

  devfileOpenScaffoldedFolderButton = document.getElementById(
    "open-file-button",
  ) as Button;

  destinationPathUrlTextField.addEventListener("input", toggleCreateButton);
  devfileNameTextField.addEventListener("input", toggleCreateButton);

  folderExplorerButton.addEventListener("click", openFolderExplorer);

  devfileCreateButton.addEventListener("click", handleCreateClick);
  devfileCreateButton.disabled = true;

  devfileClearButton.addEventListener("click", handleResetClick);

  devfileOpenScaffoldedFolderButton.addEventListener(
    "click",
    handleOpenDevfileClick,
  );

  devfileClearLogsButton.addEventListener("click", handleDevfileLogsClick);

  devfilePathDiv = document.getElementById("full-devfile-path");

  devfilePathElement = document.createElement("p");

  if (destinationPathUrlTextField.placeholder !== "") {
    devfilePathElement.innerHTML = `${destinationPathUrlTextField.placeholder}/devfile.yaml`;
  } else {
    devfilePathElement.innerHTML =
      "No folders are open in the workspace - Enter a destination directory.";
  }

  destinationPathUrlTextField.value = destinationPathUrlTextField.placeholder;

  devfileNameTextField.value = devfileNameTextField.placeholder;

  devfilePathDiv?.appendChild(devfilePathElement);
}

function openFolderExplorer(event: any) {
  const source = event.target.parentNode.id;

  const typeOption = "folder";

  vscode.postMessage({
    command: "open-explorer",
    payload: {
      selectOption: typeOption,
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
            devfilePathElement.innerHTML = selectedUri;
          }
        }
      }
    },
  );
}

function toggleCreateButton() {
  //   update <p> tag text
  if (!destinationPathUrlTextField.value.trim()) {
    if (destinationPathUrlTextField.placeholder !== "") {
      devfilePathElement.innerHTML = `${destinationPathUrlTextField.placeholder}/devfile.yaml`;
    } else {
      devfilePathElement.innerHTML =
        "No folders are open in the workspace - Enter a destination directory.";
    }
  } else {
    devfilePathElement.innerHTML = `${destinationPathUrlTextField.value.trim()}/devfile.yaml`;
  }

  if (
    devfileNameTextField.value.trim() &&
    (destinationPathUrlTextField.value.trim() ||
      destinationPathUrlTextField.placeholder !== "")
  ) {
    devfileCreateButton.disabled = false;
  } else {
    devfileCreateButton.disabled = true;
  }
}

function handleResetClick() {
  destinationPathUrlTextField.value = destinationPathUrlTextField.placeholder;
  devfileNameTextField.value = "";

  if (destinationPathUrlTextField.placeholder !== "") {
    devfilePathElement.innerHTML = `${destinationPathUrlTextField.placeholder}/devfile.yaml`;
  } else {
    devfilePathElement.innerHTML =
      "No folders are open in the workspace - Enter a destination directory.";
  }

  overwriteCheckbox.checked = false;
  imageDropdown.currentValue =
    "Upstream (ghcr.io/ansible/ansible-workspace-env-reference:latest)";

  devfileCreateButton.disabled = true;
}

function handleCreateClick() {
  let path: string;
  devfileCreateButton.disabled = true;
  if (destinationPathUrlTextField.value === "") {
    path = destinationPathUrlTextField.placeholder;
  } else {
    path = destinationPathUrlTextField.value.trim();
  }

  vscode.postMessage({
    command: "devfile-create",
    payload: {
      destinationPath: path,
      name: devfileNameTextField.value.trim(),
      image: imageDropdown.currentValue.trim(),
      isOverwritten: overwriteCheckbox.checked,
    } as DevfileFormInterface,
  });

  window.addEventListener(
    "message",
    async (event: MessageEvent<PostMessageEvent>) => {
      const message = event.data;

      switch (message.command) {
        case "execution-log":
          devfileLogsTextArea.value = message.arguments.commandOutput;

          if (
            message.arguments.status &&
            message.arguments.status === "passed"
          ) {
            devfileOpenScaffoldedFolderButton.disabled = false;
          } else {
            devfileOpenScaffoldedFolderButton.disabled = true;
          }

          projectUrl = message.arguments.projectUrl
            ? message.arguments.projectUrl
            : "";

          devfileCreateButton.disabled = false;

          return;
      }
    },
  );
}

function handleOpenDevfileClick() {
  vscode.postMessage({
    command: "open-devfile",
    payload: {
      projectUrl: projectUrl,
    },
  });
}

function handleDevfileLogsClick() {
  devfileLogsTextArea.value = "";
}
