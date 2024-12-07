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
  DevcontainerFormInterface,
  PostMessageEvent,
} from "../../../features/contentCreator/types";

provideVSCodeDesignSystem().register(allComponents);

const vscode = acquireVsCodeApi();
window.addEventListener("load", main);

let destinationPathUrlTextField: TextField;
let folderExplorerButton: Button;

let devcontainerNameTextField: TextField;

let devcontainerCreateButton: Button;
let devcontainerClearButton: Button;

let devcontainerClearLogsButton: Button;

let overwriteCheckbox: Checkbox;

let imageDropdown: Dropdown;

let devcontainerPathDiv: HTMLElement | null;
let devcontainerPathElement: HTMLElement;

let devcontainerLogsTextArea: TextArea;
let devcontainerOpenScaffoldedFolderButton: Button;

let projectUrl = "";

function main() {
  destinationPathUrlTextField = document.getElementById(
    "path-url",
  ) as TextField;
  folderExplorerButton = document.getElementById("folder-explorer") as Button;

  devcontainerNameTextField = document.getElementById(
    "devcontainer-name",
  ) as TextField;

  overwriteCheckbox = document.getElementById("overwrite-checkbox") as Checkbox;

  imageDropdown = document.getElementById("image-dropdown") as Dropdown;
  devcontainerCreateButton = document.getElementById("create-button") as Button;
  devcontainerClearButton = document.getElementById("reset-button") as Button;

  devcontainerLogsTextArea = document.getElementById(
    "log-text-area",
  ) as TextArea;

  devcontainerClearLogsButton = document.getElementById(
    "clear-logs-button",
  ) as Button;

  devcontainerOpenScaffoldedFolderButton = document.getElementById(
    "open-file-button",
  ) as Button;

  destinationPathUrlTextField.addEventListener("input", toggleCreateButton);
  devcontainerNameTextField.addEventListener("input", toggleCreateButton);

  folderExplorerButton.addEventListener("click", openFolderExplorer);

  devcontainerCreateButton.addEventListener("click", handleCreateClick);

  devcontainerClearButton.addEventListener("click", handleResetClick);

  devcontainerOpenScaffoldedFolderButton.addEventListener(
    "click",
    handleOpenDevcontainerClick,
  );

  devcontainerClearLogsButton.addEventListener(
    "click",
    handleDevcontainerLogsClick,
  );

  devcontainerPathDiv = document.getElementById("full-devcontainer-path");

  devcontainerPathElement = document.createElement("p");

  if (destinationPathUrlTextField.placeholder !== "") {
    devcontainerPathElement.innerHTML = `${destinationPathUrlTextField.placeholder}/devcontainer.yaml`;
  } else {
    devcontainerPathElement.innerHTML =
      "No folders are open in the workspace - Enter a destination directory.";
  }

  destinationPathUrlTextField.value = destinationPathUrlTextField.placeholder;

  devcontainerNameTextField.value = devcontainerNameTextField.placeholder;

  if (
    devcontainerNameTextField.value.trim() &&
    destinationPathUrlTextField.value.trim()
  ) {
    devcontainerCreateButton.disabled = false;
  } else {
    devcontainerCreateButton.disabled = true;
  }

  devcontainerPathDiv?.appendChild(devcontainerPathElement);
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
            devcontainerPathElement.innerHTML = selectedUri;
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
      devcontainerPathElement.innerHTML = `${destinationPathUrlTextField.placeholder}/devcontainer.yaml`;
    } else {
      devcontainerPathElement.innerHTML =
        "No folders are open in the workspace - Enter a destination directory.";
    }
  } else {
    devcontainerPathElement.innerHTML = `${destinationPathUrlTextField.value.trim()}/devcontainer.yaml`;
  }

  if (
    devcontainerNameTextField.value.trim() &&
    destinationPathUrlTextField.value.trim()
  ) {
    devcontainerCreateButton.disabled = false;
  } else {
    devcontainerCreateButton.disabled = true;
  }
}

function handleResetClick() {
  destinationPathUrlTextField.value = destinationPathUrlTextField.placeholder;
  devcontainerNameTextField.value = devcontainerNameTextField.placeholder;

  if (destinationPathUrlTextField.placeholder !== "") {
    devcontainerPathElement.innerHTML = `${destinationPathUrlTextField.placeholder}/devcontainer.yaml`;
  } else {
    devcontainerPathElement.innerHTML =
      "No folders are open in the workspace - Enter a destination directory.";
  }

  overwriteCheckbox.checked = false;
  imageDropdown.currentValue =
    "Upstream (ghcr.io/ansible/ansible-workspace-env-reference:latest)";

  if (
    devcontainerNameTextField.value.trim() &&
    destinationPathUrlTextField.value.trim()
  ) {
    devcontainerCreateButton.disabled = false;
  } else {
    devcontainerCreateButton.disabled = true;
  }
}

function handleCreateClick() {
  let path: string;
  devcontainerCreateButton.disabled = true;
  if (destinationPathUrlTextField.value === "") {
    path = destinationPathUrlTextField.placeholder;
  } else {
    path = destinationPathUrlTextField.value.trim();
  }

  vscode.postMessage({
    command: "devcontainer-create",
    payload: {
      destinationPath: path,
      name: devcontainerNameTextField.value.trim(),
      image: imageDropdown.currentValue.trim(),
      isOverwritten: overwriteCheckbox.checked,
    } as DevcontainerFormInterface,
  });

  window.addEventListener(
    "message",
    async (event: MessageEvent<PostMessageEvent>) => {
      const message = event.data;

      switch (message.command) {
        case "execution-log":
          devcontainerLogsTextArea.value = message.arguments.commandOutput;

          if (
            message.arguments.status &&
            message.arguments.status === "passed"
          ) {
            devcontainerOpenScaffoldedFolderButton.disabled = false;
          } else {
            devcontainerOpenScaffoldedFolderButton.disabled = true;
          }

          projectUrl = message.arguments.projectUrl
            ? message.arguments.projectUrl
            : "";

          devcontainerCreateButton.disabled = false;

          return;
      }
    },
  );
}

function handleOpenDevcontainerClick() {
  vscode.postMessage({
    command: "open-devcontainer",
    payload: {
      projectUrl: projectUrl,
    },
  });
}

function handleDevcontainerLogsClick() {
  devcontainerLogsTextArea.value = "";
}
