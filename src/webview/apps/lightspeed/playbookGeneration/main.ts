import { v4 as uuidv4 } from "uuid";
import {
  provideVSCodeDesignSystem,
  Button,
  vsCodeButton,
  vsCodeTag,
  vsCodeTextArea,
  vsCodeTextField,
  TextArea,
} from "@vscode/webview-ui-toolkit";
import { ThumbsUpDownAction } from "../../../../definitions/lightspeed";

provideVSCodeDesignSystem().register(
  vsCodeButton(),
  vsCodeTag(),
  vsCodeTextArea(),
  vsCodeTextField(),
);

const TEXTAREA_MAX_HEIGHT = 500;
const TOTAL_PAGES = 3;

let savedText: string;
let savedTextHeightPage1: string | undefined;
let savedTextHeightPage2: string | undefined;
let savedOutline: string | undefined;
let savedPlaybook: string | undefined;
let generationId: string | undefined;

const vscode = acquireVsCodeApi();

window.addEventListener("load", () => {
  setListener("submit-button", submitInput);
  setListener("generate-button", generateCode);
  setListener("reset-button", reset);
  setListener("thumbsup-button", sendThumbsup);
  setListener("thumbsdown-button", sendThumbsdown);
  setListener("back-button", backToPage1);
  setListener("back-anchor", backToPage1);
  setListener("back-to-page2-button", backToPage2);
  setListener("open-editor-button", openEditor);

  setListenerOnTextArea();

  savedText = "";
  savedOutline = "";
});

window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.command) {
    case "init": {
      const element = document.getElementById("playbook-text-area") as TextArea;
      generationId = uuidv4();
      element.focus();
      break;
    }
    case "outline": {
      setupPage(2);

      const element = document.getElementById("playbook-text-area") as TextArea;
      savedOutline = element.value = message.outline.outline;
      savedPlaybook = message.outline.playbook;
      generationId = message.outline.generationId;
      resetTextAreaHeight();
      element.rows = 10;
      const prompt = document.getElementById("prompt") as HTMLSpanElement;
      prompt.textContent = savedText;
      updateThumbsUpDownButtons(false, false);
      break;
    }
    case "playbook": {
      setupPage(3);

      const element = document.getElementById("playbook-text-area") as TextArea;
      savedPlaybook = element.value = message.playbook.playbook;
      generationId = message.playbook.generationId;
      savedOutline = message.playbook.outline;
      resetTextAreaHeight();
      element.rows = 15;
      element.readOnly = true;
      break;
    }
    // When summaries or generations API was processed normally (e.g., API error)
    // dismiss the spinner icon here.
    case "exception": {
      changeDisplay("spinnerContainer", "none");
      break;
    }
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setListener(id: string, func: any) {
  const button = document.getElementById(id) as Button;
  if (button) {
    button.addEventListener("click", async () => {
      await func();
    });
  }
}

function setListenerOnTextArea() {
  const textArea = document.getElementById("playbook-text-area") as TextArea;
  if (textArea) {
    textArea.addEventListener("input", async () => {
      const input = textArea.value;
      setButtonEnabled("submit-button", input.length > 0);

      if (savedOutline) {
        setButtonEnabled("reset-button", savedOutline !== input);
      }

      adjustTextAreaHeight();
    });
  }
}

function changeDisplay(className: string, displayState: string) {
  const elements = document.getElementsByClassName(className);
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i] as HTMLElement;
    element.style.display = displayState;
  }
}

async function submitInput() {
  const element = document.getElementById("playbook-text-area") as TextArea;

  if (savedText !== element.value) {
    savedText = element.value;
    savedOutline = undefined;
    savedPlaybook = undefined;
    savedTextHeightPage1 = getInputHeight();
  }

  changeDisplay("spinnerContainer", "block");

  vscode.postMessage({
    command: "outline",
    text: savedText,
    playbook: savedPlaybook,
    outline: savedOutline,
    generationId,
  });
  element.focus();
}

function reset() {
  const element = document.getElementById("playbook-text-area") as TextArea;
  if (savedOutline) {
    element.value = savedOutline;
  }
  element.focus();
}

function backToPage1() {
  setupPage(1);

  const element = document.getElementById("playbook-text-area") as TextArea;
  if (savedText) {
    element.value = savedText;
  }
  element.readOnly = false;
  resetTextAreaHeight(savedTextHeightPage1);

  element.rows = 5;
  element.focus();
}

function backToPage2() {
  setupPage(2);

  const element = document.getElementById("playbook-text-area") as TextArea;
  if (savedOutline) {
    element.value = savedOutline;
  }
  element.readOnly = false;
  resetTextAreaHeight(savedTextHeightPage2);

  element.rows = 10;
  element.focus();
}

async function generateCode() {
  const element = document.getElementById("playbook-text-area") as TextArea;
  const text = savedText;
  const outline = element.value;
  savedTextHeightPage2 = getInputHeight();

  // If user did not make any changes to the generated outline, use the saved playbook
  // installed of calling the generations API again.
  const playbook = savedOutline === outline ? savedPlaybook : undefined;

  changeDisplay("spinnerContainer", "block");

  vscode.postMessage({
    command: "generateCode",
    text,
    outline,
    playbook,
    generationId,
  });
  element.focus();
}

async function openEditor() {
  vscode.postMessage({
    command: "openEditor",
    playbook: savedPlaybook,
  });
}

function updateThumbsUpDownButtons(selectUp: boolean, selectDown: boolean) {
  const thumbsUpButton = document.getElementById("thumbsup-button") as Button;
  const thumbsDownButton = document.getElementById(
    "thumbsdown-button",
  ) as Button;
  thumbsUpButton.setAttribute(
    "class",
    selectUp ? "iconButtonSelected" : "iconButton",
  );
  thumbsDownButton.setAttribute(
    "class",
    selectDown ? "iconButtonSelected" : "iconButton",
  );
  thumbsUpButton.disabled = thumbsDownButton.disabled = selectUp || selectDown;
}

function sendThumbsup() {
  updateThumbsUpDownButtons(true, false);
  vscode.postMessage({
    command: "thumbsUp",
    action: ThumbsUpDownAction.UP,
    generationId: generationId,
  });
}

function sendThumbsdown() {
  updateThumbsUpDownButtons(false, true);
  vscode.postMessage({
    command: "thumbsDown",
    action: ThumbsUpDownAction.DOWN,
    generationId: generationId,
  });
}

function getTextAreaInShadowDOM() {
  const shadowRoot = document.querySelector("vscode-text-area")?.shadowRoot;
  return shadowRoot?.querySelector("textarea");
}

function getInputHeight(): string | undefined {
  const textarea = getTextAreaInShadowDOM();
  return textarea?.style.height;
}

function resetTextAreaHeight(savedTextHeight = "") {
  const textarea = getTextAreaInShadowDOM();
  if (textarea) {
    textarea.style.height = savedTextHeight;
  }
}

function adjustTextAreaHeight() {
  const textarea = getTextAreaInShadowDOM();
  if (textarea?.scrollHeight) {
    const scrollHeight = textarea?.scrollHeight;
    if (scrollHeight < TEXTAREA_MAX_HEIGHT) {
      if (textarea?.style.height) {
        const height = parseInt(textarea?.style.height);
        if (height >= scrollHeight) {
          return;
        }
      }
      // +2 was needed to eliminate scrollbar...
      textarea.style.height = `${scrollHeight + 2}px`;
    }
  }
}

function setPageNumber(pageNumber: number) {
  const span = document.getElementById("page-number") as Element;
  span.textContent = `${pageNumber} of ${TOTAL_PAGES}`;
}

function setButtonEnabled(id: string, enabled: boolean) {
  const element = document.getElementById(id) as Button;
  element.disabled = !enabled;
}

function setupPage(pageNumber: number) {
  switch (pageNumber) {
    case 1:
      setPageNumber(1);
      changeDisplay("bigIconButtonContainer", "block");
      changeDisplay("examplesContainer", "block");
      changeDisplay("resetFeedbackContainer", "none");
      changeDisplay("firstMessage", "block");
      changeDisplay("secondMessage", "none");
      changeDisplay("thirdMessage", "none");
      changeDisplay("generatePlaybookContainer", "none");
      changeDisplay("promptContainer", "none");
      changeDisplay("openEditorContainer", "none");
      break;
    case 2:
      setPageNumber(2);
      changeDisplay("spinnerContainer", "none");
      changeDisplay("bigIconButtonContainer", "none");
      changeDisplay("examplesContainer", "none");
      changeDisplay("resetFeedbackContainer", "block");
      changeDisplay("resetContainer", "block");
      changeDisplay("feedbackContainer", "none");
      changeDisplay("firstMessage", "none");
      changeDisplay("secondMessage", "block");
      changeDisplay("thirdMessage", "none");
      changeDisplay("generatePlaybookContainer", "block");
      changeDisplay("promptContainer", "block");
      changeDisplay("openEditorContainer", "none");
      setButtonEnabled("reset-button", false);
      break;
    case 3:
      setPageNumber(3);
      changeDisplay("spinnerContainer", "none");
      changeDisplay("bigIconButtonContainer", "none");
      changeDisplay("examplesContainer", "none");
      changeDisplay("resetFeedbackContainer", "block");
      changeDisplay("resetContainer", "none");
      changeDisplay("feedbackContainer", "block");
      changeDisplay("firstMessage", "none");
      changeDisplay("secondMessage", "none");
      changeDisplay("thirdMessage", "block");
      changeDisplay("generatePlaybookContainer", "none");
      changeDisplay("openEditorContainer", "block");

      break;
  }
}
