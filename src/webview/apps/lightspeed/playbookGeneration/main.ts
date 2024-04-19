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

const TEXTAREA_MAX_HEIGHT = 500;

let savedInput: string;
let savedInputHeight: string | undefined;
let savedSummary: string;

const vscode = acquireVsCodeApi();

window.addEventListener("load", () => {
  setListener("submit-button", submitInput);
  setListener("generate-button", generatePlaybook);
  setListener("reset-button", reset);
  setListener("thumbsup-button", sendThumbsup);
  setListener("thumbsdown-button", sendThumbsdown);
  setListener("back-button", back);

  setListenerOnTextArea();

  savedInput = "";
  savedSummary = "";
});

window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.command) {
    case "focus": {
      const element = document.getElementById("playbook-text-area") as TextArea;
      element.focus();
      break;
    }
    case "summary": {
      const button = document.getElementById("submit-icon") as Button;
      button.setAttribute("class", "codicon codicon-run-all");

      changeDisplay("spinnerContainer", "none");
      changeDisplay("bigIconButtonContainer", "none");
      changeDisplay("examplesContainer", "none");
      changeDisplay("resetFeedbackContainer", "block");
      changeDisplay("firstMessage", "none");
      changeDisplay("secondMessage", "block");
      changeDisplay("generatePlaybookContainer", "block");

      const element = document.getElementById("playbook-text-area") as TextArea;
      savedSummary = element.value = message.summary;
      resetTextAreaHeight();
      element.rows = 25;

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
  if (textArea) {
    textArea.addEventListener("input", async () => {
      const input = textArea.value;
      submitButton.disabled = input.length === 0;

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
  savedInput = element.value;
  savedInputHeight = getInputHeight();

  changeDisplay("spinnerContainer", "block");

  vscode.postMessage({ command: "summarizeInput", content: savedInput });
  element.focus();
}

function reset() {
  const element = document.getElementById("playbook-text-area") as TextArea;
  element.value = savedSummary;
  element.focus();
}

function back() {
  changeDisplay("bigIconButtonContainer", "block");
  changeDisplay("examplesContainer", "block");
  changeDisplay("resetFeedbackContainer", "none");
  changeDisplay("firstMessage", "block");
  changeDisplay("secondMessage", "none");
  changeDisplay("generatePlaybookContainer", "none");

  const element = document.getElementById("playbook-text-area") as TextArea;
  if (savedInput) {
    element.value = savedInput;
  }
  resetTextAreaHeight(savedInputHeight);
  element.rows = 5;

  element.focus();
}

async function generatePlaybook() {
  const element = document.getElementById("playbook-text-area") as TextArea;
  const content = element.value;

  changeDisplay("spinnerContainer", "block");

  vscode.postMessage({ command: "generatePlaybook", content });
}

function sendThumbsup() {
  const thumbsUpButton = document.getElementById("thumbsup-button") as Button;
  const thumbsDownButton = document.getElementById(
    "thumbsdown-button",
  ) as Button;
  thumbsUpButton.setAttribute("class", "iconButtonSelected");
  thumbsDownButton.setAttribute("class", "iconButton");
  vscode.postMessage({ command: "thumbsUp" });
}

function sendThumbsdown() {
  const thumbsUpButton = document.getElementById("thumbsup-button") as Button;
  const thumbsDownButton = document.getElementById(
    "thumbsdown-button",
  ) as Button;
  thumbsUpButton.setAttribute("class", "iconButton");
  thumbsDownButton.setAttribute("class", "iconButtonSelected");
  vscode.postMessage({ command: "thumbsDown" });
}

function getTextAreaInShadowDOM() {
  const shadowRoot = document.querySelector("vscode-text-area")?.shadowRoot;
  return shadowRoot?.querySelector("textarea");
}

function getInputHeight(): string | undefined {
  const textarea = getTextAreaInShadowDOM();
  return textarea?.style.height;
}

function resetTextAreaHeight(savedInputHeight = "") {
  const textarea = getTextAreaInShadowDOM();
  if (textarea) {
    textarea.style.height = savedInputHeight;
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
