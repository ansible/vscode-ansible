/* eslint-disable  @typescript-eslint/no-explicit-any */

import {
  AnsibleExecutionEnvInterface,
  PostMessageEvent,
} from "../../../features/contentCreator/types";
import ansiRegex from "ansi-regex";
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

let initCreateButton: VscodeButton;
let initClearButton: VscodeButton;

let overwriteCheckbox: VscodeCheckbox;

let verboseDropdown: VscodeSingleSelect;

let baseImageDropdown: VscodeSingleSelect;
let customBaseImageField: VscodeTextfield;

let createContextCheckbox: VscodeCheckbox;
let buildImageCheckbox: VscodeCheckbox;

let suggestedCollectionsCheckboxes: NodeListOf<VscodeCheckbox>;
let collectionsTextField: VscodeTextfield;
let systemPackagesTextField: VscodeTextfield;
let pythonPackagesTextField: VscodeTextfield;
let tagTextField: VscodeTextfield;

let initDestinationPathDiv: HTMLElement | null;
let initDestinationPathElement: HTMLElement;

let initLogsTextArea: VscodeTextarea;
let initClearLogsButton: VscodeButton;
let initOpenScaffoldedFileButton: VscodeButton;

let projectUrl = "";

function main() {
  destinationPathUrlTextField = document.getElementById(
    "path-url",
  ) as VscodeTextfield;
  folderExplorerIcon = document.getElementById("folder-explorer") as VscodeIcon;

  overwriteCheckbox = document.getElementById(
    "overwrite-checkbox",
  ) as VscodeCheckbox;

  verboseDropdown = document.getElementById(
    "verbosity-dropdown",
  ) as VscodeSingleSelect;
  baseImageDropdown = document.getElementById(
    "baseImage-dropdown",
  ) as VscodeSingleSelect;
  customBaseImageField = document.getElementById(
    "customBaseImage-name",
  ) as VscodeTextfield;
  createContextCheckbox = document.getElementById(
    "createContext-checkbox",
  ) as VscodeCheckbox;
  buildImageCheckbox = document.getElementById(
    "buildImage-checkbox",
  ) as VscodeCheckbox;

  suggestedCollectionsCheckboxes = document.querySelectorAll(
    "#suggestedCollections-checkboxes vscode-checkbox",
  );
  collectionsTextField = document.getElementById(
    "collections-name",
  ) as VscodeTextfield;
  systemPackagesTextField = document.getElementById(
    "systemPackages-name",
  ) as VscodeTextfield;
  pythonPackagesTextField = document.getElementById(
    "pythonPackages-name",
  ) as VscodeTextfield;
  tagTextField = document.getElementById("tag-name") as VscodeTextfield;

  initCreateButton = document.getElementById("create-button") as VscodeButton;
  initClearButton = document.getElementById("clear-button") as VscodeButton;

  initLogsTextArea = document.getElementById("log-text-area") as VscodeTextarea;
  initClearLogsButton = document.getElementById(
    "clear-logs-button",
  ) as VscodeButton;
  initOpenScaffoldedFileButton = document.getElementById(
    "open-file-button",
  ) as VscodeButton;

  destinationPathUrlTextField.addEventListener("input", toggleCreateButton);

  folderExplorerIcon.addEventListener("click", openExplorer);

  collectionsTextField.addEventListener("input", toggleCreateButton);
  systemPackagesTextField.addEventListener("input", toggleCreateButton);
  pythonPackagesTextField.addEventListener("input", toggleCreateButton);
  tagTextField.addEventListener("input", toggleCreateButton);
  suggestedCollectionsCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", handleSuggestedCollectionsChange);
  });

  baseImageDropdown.addEventListener("change", toggleCustomBaseImageField);
  customBaseImageField.addEventListener("input", toggleBaseImageDropdown);

  createContextCheckbox.addEventListener("change", handleCreateContextClick);
  buildImageCheckbox.addEventListener("change", handleBuildImageClick);

  initCreateButton.addEventListener("click", handleInitCreateClick);
  initClearButton.addEventListener("click", handleInitClearClick);

  initClearLogsButton.addEventListener("click", handleInitClearLogsClick);
  initOpenScaffoldedFileButton.addEventListener(
    "click",
    handleInitOpenScaffoldedFileClick,
  );

  initDestinationPathDiv = document.getElementById("full-destination-path");

  initDestinationPathElement = document.createElement("p");
  initDestinationPathElement.innerHTML =
    destinationPathUrlTextField.placeholder as string;
  initDestinationPathDiv?.appendChild(initDestinationPathElement);
  toggleCustomBaseImageField();
}

function handleSuggestedCollectionsChange() {
  return Array.from(suggestedCollectionsCheckboxes)
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.value)
    .join(", ");
}

function handleCreateContextClick() {
  if (buildImageCheckbox.checked) {
    createContextCheckbox.checked = true;
    createContextCheckbox.disabled = true;
  } else {
    createContextCheckbox.disabled = false;
  }
}

function handleBuildImageClick() {
  if (buildImageCheckbox.checked) {
    createContextCheckbox.checked = true;
    createContextCheckbox.disabled = true;
  } else {
    createContextCheckbox.disabled = false;
  }
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
            destinationPathUrlTextField.value = selectedUri;
            initDestinationPathElement.innerHTML = selectedUri;
          }
        }
      }
    },
  );
}
function toggleCustomBaseImageField() {
  const selectedValue = baseImageDropdown.value.trim();
  if (selectedValue !== "") {
    customBaseImageField.disabled = true;
    customBaseImageField.value = "";
  } else {
    customBaseImageField.disabled = false;
  }
  toggleCreateButton();
}

function toggleBaseImageDropdown() {
  const customBaseImageValue = customBaseImageField.value.trim();
  if (customBaseImageValue !== "") {
    baseImageDropdown.value = "";
    baseImageDropdown.disabled = true;
  } else {
    baseImageDropdown.disabled = false;
  }
  toggleCreateButton();
}

function validateBaseImage() {
  const selectedBaseImage = baseImageDropdown.value.trim();
  const customBaseImage = customBaseImageField.value.trim();

  if (!selectedBaseImage && !customBaseImage) {
    alert("Please select or enter a base image.");
    return false;
  }
  return true;
}

function handleInitClearClick() {
  destinationPathUrlTextField.value = "";

  baseImageDropdown.value = "";
  customBaseImageField.value = "";

  createContextCheckbox.checked = false;
  createContextCheckbox.disabled = false;

  buildImageCheckbox.checked = false;

  collectionsTextField.value = "";
  systemPackagesTextField.value = "";
  pythonPackagesTextField.value = "";
  tagTextField.value = "";

  suggestedCollectionsCheckboxes.forEach((checkbox) => {
    checkbox.checked = false;
  });

  initDestinationPathElement.innerHTML =
    destinationPathUrlTextField.placeholder as string;

  overwriteCheckbox.checked = false;
  verboseDropdown.value = "Off";

  initCreateButton.disabled = false;

  customBaseImageField.disabled = false;
  baseImageDropdown.disabled = false;

  initOpenScaffoldedFileButton.disabled = true;
}

function toggleCreateButton() {
  if (!destinationPathUrlTextField.value.trim()) {
    if (destinationPathUrlTextField.placeholder !== "") {
      initDestinationPathElement.innerHTML = `${destinationPathUrlTextField.placeholder}/execution-environment.yml`;
    } else {
      initDestinationPathElement.innerHTML =
        "No folders are open in the workspace - Enter a destination directory.";
    }
  } else {
    initDestinationPathElement.innerHTML = `${destinationPathUrlTextField.value.trim()}/execution-environment.yml`;
  }

  const isDestinationPathProvided =
    destinationPathUrlTextField.value.trim() !== "";
  const isTagProvided = tagTextField.value.trim() !== "";
  const isBaseImageProvided =
    baseImageDropdown.value.trim() !== "" ||
    customBaseImageField.value.trim() !== "";

  initCreateButton.disabled = !(
    isDestinationPathProvided &&
    isTagProvided &&
    isBaseImageProvided
  );
}

function stripAnsiCodes(text: string): string {
  return text.replace(ansiRegex(), "");
}

function handleInitCreateClick() {
  initCreateButton.disabled = false;
  const isBaseImageValid = validateBaseImage();
  if (!isBaseImageValid) {
    return;
  }

  const collectionsText = collectionsTextField.value.trim();
  const suggestedCollections = handleSuggestedCollectionsChange();

  let final_collections = "";
  if (collectionsText && suggestedCollections) {
    final_collections = `${suggestedCollections}, ${collectionsText}`;
  } else if (collectionsText) {
    final_collections = collectionsText;
  } else if (suggestedCollections) {
    final_collections = suggestedCollections;
  }
  final_collections = final_collections
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .join(", ");

  vscode.postMessage({
    command: "init-create",
    payload: {
      destinationPath: destinationPathUrlTextField.value.trim(),
      verbosity: verboseDropdown.value.trim(),
      isOverwritten: overwriteCheckbox.checked,
      isCreateContextEnabled: createContextCheckbox.checked,
      isBuildImageEnabled: buildImageCheckbox.checked,
      baseImage: baseImageDropdown.value.trim(),
      customBaseImage: customBaseImageField.value.trim(),
      collections: final_collections.trim(),
      systemPackages: systemPackagesTextField.value.trim(),
      pythonPackages: pythonPackagesTextField.value.trim(),
      tag: tagTextField.value.trim(),
    } as AnsibleExecutionEnvInterface,
  });

  window.addEventListener(
    "message",
    async (event: MessageEvent<PostMessageEvent>) => {
      const message = event.data;

      switch (message.command) {
        case "execution-log":
          initLogsTextArea.value = stripAnsiCodes(
            message.arguments.commandOutput,
          );

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

function handleInitOpenScaffoldedFileClick() {
  vscode.postMessage({
    command: "init-open-scaffolded-file",
    payload: {
      projectUrl: projectUrl,
    },
  });
}
