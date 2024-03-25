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
  vsCodeTextField()
);

let savedInput: string;
let savedSummary: string;

const vscode = acquireVsCodeApi();

window.addEventListener("load", main);
window.addEventListener("message", event => {
  const message = event.data;

  switch (message.command) {
    case "focus": {
      const element = document.getElementById("playbook-text-area") as TextArea;
      element.focus();
      break;
    }
    case "summary": {
      const element = document.getElementById("playbook-text-area") as TextArea;
      savedSummary = message.summary;
      const lines = savedSummary.split(/\n/).length;
      if (lines > 5) {
        element.rows = Math.min(lines, 15);
      }
      element.value = savedSummary;
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

function main() {
  setListener("submit-button", submitInput);
  setListener("generate-button", generatePlaybook);
  setListener("reset-button", reset);
  setListener("thumbsup-button", sendThumbsup);
  setListener("thumbsdown-button", sendThumbsdown);
  setListener("back-button", back);

  savedInput = "";
  savedSummary = "";
}

function changeDisplay(className: string, displayState: string) {
  const elements = document.getElementsByClassName(className);
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i] as HTMLElement;
    element.style.display = displayState;
  }
}

async function submitInput() {
  changeDisplay("bigIconButtonContainer", "none");
  changeDisplay("examplesContainer", "none");
  changeDisplay("resetFeedbackContainer", "block");
  changeDisplay("firstMessage", "none");
  changeDisplay("secondMessage", "block");
  changeDisplay("generatePlaybookContainer", "block");

  const element = document.getElementById("playbook-text-area") as TextArea;
  savedInput = element.value;
  element.value = "";

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
  const lines = savedInput.split(/\n/).length;
  if (lines <= 5) {
    element.rows = Math.max(lines, 5);
  }
  element.focus();
}


async function generatePlaybook() {
  const element = document.getElementById("playbook-text-area") as TextArea;
  const content = element.value;
  vscode.postMessage({ command: "generatePlaybook", content });
}

function sendThumbsup() {
  const thumbsUpButton = document.getElementById("thumbsup-button") as Button;
  const thumbsDownButton = document.getElementById("thumbsdown-button") as Button;
  thumbsUpButton.appearance = "primary";
  thumbsDownButton.appearance = "icon";
  vscode.postMessage({ command: "thumbsUp" });
}

function sendThumbsdown() {
  const thumbsUpButton = document.getElementById("thumbsup-button") as Button;
  const thumbsDownButton = document.getElementById("thumbsdown-button") as Button;
  thumbsUpButton.appearance = "icon";
  thumbsDownButton.appearance = "primary";
  vscode.postMessage({ command: "thumbsDown" });
}
