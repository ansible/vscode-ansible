/* eslint-disable  @typescript-eslint/no-explicit-any */

import {
  DevfileFormInterface,
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

let devfileNameTextField: VscodeTextfield;

let devfileCreateButton: VscodeButton;
let devfileClearButton: VscodeButton;

let devfileClearLogsButton: VscodeButton;

let overwriteCheckbox: VscodeCheckbox;

let imageDropdown: VscodeSingleSelect;

let devfilePathDiv: HTMLElement | null;
let devfilePathElement: HTMLElement;

let devfileLogsTextArea: VscodeTextarea;
let devfileOpenScaffoldedFolderButton: VscodeButton;

let projectUrl = "";

function main() {
  destinationPathUrlTextField = document.getElementById(
    "path-url",
  ) as VscodeTextfield;
  folderExplorerIcon = document.getElementById("folder-explorer") as VscodeIcon;

  devfileNameTextField = document.getElementById(
    "devfile-name",
  ) as VscodeTextfield;

  overwriteCheckbox = document.getElementById(
    "overwrite-checkbox",
  ) as VscodeCheckbox;

  imageDropdown = document.getElementById(
    "image-dropdown",
  ) as VscodeSingleSelect;
  devfileCreateButton = document.getElementById(
    "create-button",
  ) as VscodeButton;
  devfileClearButton = document.getElementById("reset-button") as VscodeButton;

  devfileLogsTextArea = document.getElementById(
    "log-text-area",
  ) as VscodeTextarea;

  devfileClearLogsButton = document.getElementById(
    "clear-logs-button",
  ) as VscodeButton;

  devfileOpenScaffoldedFolderButton = document.getElementById(
    "open-file-button",
  ) as VscodeButton;

  destinationPathUrlTextField.addEventListener("input", toggleCreateButton);
  devfileNameTextField.addEventListener("input", toggleCreateButton);

  folderExplorerIcon.addEventListener("click", openFolderExplorer);

  devfileCreateButton.addEventListener("click", handleCreateClick);

  devfileClearButton.addEventListener("click", handleResetClick);

  devfileOpenScaffoldedFolderButton.addEventListener(
    "click",
    handleOpenDevfileClick,
  );

  devfileClearLogsButton.addEventListener("click", handleDevfileLogsClick);

  devfilePathDiv = document.getElementById("full-devfile-path");

  devfilePathElement = document.createElement("p");

  if (destinationPathUrlTextField.placeholder !== "") {
    devfilePathElement.innerHTML = `${destinationPathUrlTextField.placeholder as string}/devfile.yaml`;
  } else {
    devfilePathElement.innerHTML =
      "No folders are open in the workspace - Enter a destination directory.";
  }

  destinationPathUrlTextField.value =
    destinationPathUrlTextField.placeholder as string;
  devfileNameTextField.value = devfileNameTextField.placeholder as string;

  if (
    devfileNameTextField.value.trim() &&
    destinationPathUrlTextField.value.trim()
  ) {
    devfileCreateButton.disabled = false;
  } else {
    devfileCreateButton.disabled = true;
  }

  devfilePathDiv?.appendChild(devfilePathElement);
}

function openFolderExplorer(event: any) {
  const source = event.target.id;

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
            devfilePathElement.innerHTML = `${selectedUri}/devfile.yaml`;
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
      devfilePathElement.innerHTML = `${destinationPathUrlTextField.placeholder as string}/devfile.yaml`;
    } else {
      devfilePathElement.innerHTML =
        "No folders are open in the workspace - Enter a destination directory.";
    }
  } else {
    devfilePathElement.innerHTML = `${destinationPathUrlTextField.value.trim()}/devfile.yaml`;
  }

  if (
    devfileNameTextField.value.trim() &&
    destinationPathUrlTextField.value.trim()
  ) {
    devfileCreateButton.disabled = false;
  } else {
    devfileCreateButton.disabled = true;
  }
}

function handleResetClick() {
  destinationPathUrlTextField.value =
    destinationPathUrlTextField.placeholder as string;
  devfileNameTextField.value = devfileNameTextField.placeholder as string;

  if (destinationPathUrlTextField.placeholder !== "") {
    devfilePathElement.innerHTML = `${destinationPathUrlTextField.placeholder}/devfile.yaml`;
  } else {
    devfilePathElement.innerHTML =
      "No folders are open in the workspace - Enter a destination directory.";
  }

  overwriteCheckbox.checked = false;
  imageDropdown.value = "Upstream (ghcr.io/ansible/ansible-devspaces:latest)";

  if (
    devfileNameTextField.value.trim() &&
    destinationPathUrlTextField.value.trim()
  ) {
    devfileCreateButton.disabled = false;
  } else {
    devfileCreateButton.disabled = true;
  }
}

function handleCreateClick() {
  let path: string;
  devfileCreateButton.disabled = true;
  if (destinationPathUrlTextField.value === "") {
    path = destinationPathUrlTextField.placeholder as string;
  } else {
    path = destinationPathUrlTextField.value.trim();
  }

  vscode.postMessage({
    command: "devfile-create",
    payload: {
      destinationPath: path,
      name: devfileNameTextField.value.trim(),
      image: imageDropdown.value.trim(),
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
