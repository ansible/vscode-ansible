/* eslint-disable  @typescript-eslint/no-explicit-any */

import {
  DevcontainerFormInterface,
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

let devcontainerCreateButton: VscodeButton;
let devcontainerClearButton: VscodeButton;

let devcontainerClearLogsButton: VscodeButton;

let overwriteCheckbox: VscodeCheckbox;

let imageDropdown: VscodeSingleSelect;

let devcontainerPathDiv: HTMLElement | null;
let devcontainerPathElement: HTMLElement;

let devcontainerLogsTextArea: VscodeTextarea;
let devcontainerOpenScaffoldedFolderButton: VscodeButton;

let projectUrl = "";

function main() {
  destinationPathUrlTextField = document.getElementById(
    "path-url",
  ) as VscodeTextfield;
  folderExplorerIcon = document.getElementById("folder-explorer") as VscodeIcon;

  overwriteCheckbox = document.getElementById(
    "overwrite-checkbox",
  ) as VscodeCheckbox;

  imageDropdown = document.getElementById(
    "image-dropdown",
  ) as VscodeSingleSelect;
  devcontainerCreateButton = document.getElementById(
    "create-button",
  ) as VscodeButton;
  devcontainerClearButton = document.getElementById(
    "reset-button",
  ) as VscodeButton;

  devcontainerLogsTextArea = document.getElementById(
    "log-text-area",
  ) as VscodeTextarea;

  devcontainerClearLogsButton = document.getElementById(
    "clear-logs-button",
  ) as VscodeButton;

  devcontainerOpenScaffoldedFolderButton = document.getElementById(
    "open-file-button",
  ) as VscodeButton;

  destinationPathUrlTextField.addEventListener("input", toggleCreateButton);

  folderExplorerIcon.addEventListener("click", openFolderExplorer);

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
    devcontainerPathElement.innerHTML = `${destinationPathUrlTextField.placeholder as string}/.devcontainer`;
  } else {
    devcontainerPathElement.innerHTML =
      "No folders are open in the workspace - Enter a destination directory.";
  }

  destinationPathUrlTextField.value =
    destinationPathUrlTextField.placeholder as string;

  if (destinationPathUrlTextField.value.trim()) {
    devcontainerCreateButton.disabled = false;
  } else {
    devcontainerCreateButton.disabled = true;
  }

  devcontainerPathDiv?.appendChild(devcontainerPathElement);
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
            devcontainerPathElement.innerHTML = `${selectedUri}/.devcontainer`;
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
      devcontainerPathElement.innerHTML = `${destinationPathUrlTextField.placeholder as string}/.devcontainer`;
    } else {
      devcontainerPathElement.innerHTML =
        "No folders are open in the workspace - Enter a destination directory.";
    }
  } else {
    devcontainerPathElement.innerHTML = `${destinationPathUrlTextField.value.trim()}/.devcontainer`;
  }

  if (destinationPathUrlTextField.value.trim()) {
    devcontainerCreateButton.disabled = false;
  } else {
    devcontainerCreateButton.disabled = true;
  }
}

function handleResetClick() {
  destinationPathUrlTextField.value =
    destinationPathUrlTextField.placeholder as string;

  if (destinationPathUrlTextField.placeholder !== "") {
    devcontainerPathElement.innerHTML = `${destinationPathUrlTextField.placeholder}/.devcontainer`;
  } else {
    devcontainerPathElement.innerHTML =
      "No folders are open in the workspace - Enter a destination directory.";
  }

  overwriteCheckbox.checked = false;
  const imageDropdownOptions = [
    "Upstream (ghcr.io/ansible/community-ansible-dev-tools:latest)",
    "Downstream (registry.redhat.io/ansible-automation-platform-25/ansible-dev-tools-rhel8:latest)",
  ];
  imageDropdown.value = imageDropdownOptions[0];

  if (destinationPathUrlTextField.value.trim()) {
    devcontainerCreateButton.disabled = false;
  } else {
    devcontainerCreateButton.disabled = true;
  }
}

function handleCreateClick() {
  let path: string;
  devcontainerCreateButton.disabled = true;
  if (destinationPathUrlTextField.value === "") {
    path = destinationPathUrlTextField.placeholder as string;
  } else {
    path = destinationPathUrlTextField.value.trim();
  }

  vscode.postMessage({
    command: "devcontainer-create",
    payload: {
      destinationPath: path,
      image: imageDropdown.value.trim(),
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
