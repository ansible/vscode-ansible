import {
  provideVSCodeDesignSystem,
  Button,
  vsCodeButton,
  vsCodeTag,
  vsCodeTextArea,
  vsCodeTextField,
  TextArea,
} from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(
  vsCodeButton(),
  vsCodeTag(),
  vsCodeTextArea(),
  vsCodeTextField(),
);

const vscode = acquireVsCodeApi();

const sampleDescription = `Create an azure network peering between VNET named VNET_A and VNET named VNET_B`;

const sampleSuggestion = `Name: "Create an azure network..."
Description: "Create an azure network peering between VNET named VNET_1 and VNET named VNET_2"
This playbook will perform the following tass by this order:

  1. Create VNET named VNET_1
  2. Create VNET named VNET_2
  3. Create virtual network peering
`;

window.addEventListener("load", main);

const FAKE_DELAY = 2000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pause(): Promise<void> {
  return sleep(FAKE_DELAY);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setListener(id: string, func: any) {
  const button = document.getElementById(id) as Button;
  if (button) {
    button.addEventListener("click", async () => {
      await func();
    });
  }
}

function main() {
  setListener("submit-button", submitInput);
  setListener("create-button", createPlaybook);
  setListener("edit-button", editInput);
  setListener("undo-button", undoSuggestion);
  setListener("thumbsup-button", sendThumbsup);
  setListener("thumbsdown-button", sendThumbsdown);
  setListener("restart-button", updateExamples);
  setListener("continue-button", updateHtml);
  setListener("azure-example1", updateDescription);
  setListener("azure-example2", updateDescription);
  setListener("aws-example", updateDescriptionAWS);
}

function changeDisplay(className: string, displayState: string) {
  const elements = document.getElementsByClassName(className);
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i] as HTMLElement;
    element.style.display = displayState;
  }
}

async function submitInput() {
  changeDisplay("bigIconButton", "none");
  changeDisplay("examplesContainer", "none");
  changeDisplay("editUndoFeedbackContainer", "block");
  changeDisplay("continueButtonContainer", "block");

  const element = document.getElementById("playbook-text-area") as TextArea;
  element.value = "";

  await pause();

  element.value = sampleSuggestion;
  element.readOnly = true;
}

async function createPlaybook() {
  await pause();
  vscode.postMessage({ command: "createPlaybook" });
}

function editInput() {
  const element = document.getElementById("playbook-text-area") as TextArea;
  element.readOnly = false;
}

function undoSuggestion() {
  /* no-op */
}

function sendThumbsup() {
  vscode.postMessage({ command: "thumbsUp" });
}

function sendThumbsdown() {
  vscode.postMessage({ command: "thumbsDown" });
}

async function updateExamples() {
  changeDisplay("awsExample", "none");
  await pause();
  changeDisplay("azureExample", "flex");
}

function updateDescription() {
  const element = document.getElementById("playbook-text-area") as TextArea;
  element.value = sampleDescription;
}

function updateDescriptionAWS() {
  /* no-op */
}

async function updateHtml() {
  await pause();
  vscode.postMessage({ command: "updateHtml" });
}
