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

let savedText: string;
let savedTextHeight: string | undefined;
let savedOutline: string;
let savedPlaybook: string;
let outlineId: string | undefined;

const vscode = acquireVsCodeApi();

window.addEventListener("load", () => {
  setListener("submit-button", submitInput);
  setListener("generate-button", generatePlaybook);
  setListener("reset-button", reset);
  setListener("thumbsup-button", sendThumbsup);
  setListener("thumbsdown-button", sendThumbsdown);
  setListener("back-button", back);
  setListener("back-anchor", back);

  setListenerOnTextArea();

  savedText = "";
  savedOutline = "";
});

window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.command) {
    case "focus": {
      const element = document.getElementById("playbook-text-area") as TextArea;
      element.focus();
      break;
    }
    case "outline": {
      changeDisplay("spinnerContainer", "none");
      changeDisplay("bigIconButtonContainer", "none");
      changeDisplay("examplesContainer", "none");
      changeDisplay("resetFeedbackContainer", "block");
      changeDisplay("firstMessage", "none");
      changeDisplay("secondMessage", "block");
      changeDisplay("generatePlaybookContainer", "block");
      changeDisplay("promptContainer", "block");

      updateThumbsUpDownButtons(false, false);

      const element = document.getElementById("playbook-text-area") as TextArea;
      savedOutline = element.value = message.outline.outline;
      savedPlaybook = message.outline.playbook;
      outlineId = message.outline.generationId;
      resetTextAreaHeight();

      const prompt = document.getElementById("prompt") as HTMLSpanElement;
      prompt.textContent = savedText;

      element.rows = 20;

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
  const submitButton = document.getElementById("submit-button") as Button;
  const resetButton = document.getElementById("reset-button") as Button;
  if (textArea) {
    textArea.addEventListener("input", async () => {
      const input = textArea.value;
      submitButton.disabled = input.length === 0;

      if (savedOutline) {
        resetButton.disabled = savedOutline === input;
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
  savedText = element.value;
  savedTextHeight = getInputHeight();

  changeDisplay("spinnerContainer", "block");

  vscode.postMessage({ command: "outline", text: savedText });
  element.focus();
}

function reset() {
  const element = document.getElementById("playbook-text-area") as TextArea;
  element.value = savedOutline;
  element.focus();
}

function back() {
  changeDisplay("bigIconButtonContainer", "block");
  changeDisplay("examplesContainer", "block");
  changeDisplay("resetFeedbackContainer", "none");
  changeDisplay("firstMessage", "block");
  changeDisplay("secondMessage", "none");
  changeDisplay("generatePlaybookContainer", "none");
  changeDisplay("promptContainer", "none");

  const element = document.getElementById("playbook-text-area") as TextArea;
  if (savedText) {
    element.value = savedText;
  }
  resetTextAreaHeight(savedTextHeight);
  element.rows = 5;

  element.focus();
}

async function generatePlaybook() {
  const element = document.getElementById("playbook-text-area") as TextArea;
  const text = savedText;
  const outline = element.value;

  // If user did not make any changes to the generated outline, use the saved playbook
  // installed of calling the generations API again.
  const playbook = savedOutline === outline ? savedPlaybook : undefined;

  changeDisplay("spinnerContainer", "block");

  vscode.postMessage({
    command: "generatePlaybook",
    text,
    outline,
    playbook,
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
    outlineId,
  });
}

function sendThumbsdown() {
  updateThumbsUpDownButtons(false, true);
  vscode.postMessage({
    command: "thumbsDown",
    action: ThumbsUpDownAction.DOWN,
    outlineId,
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
