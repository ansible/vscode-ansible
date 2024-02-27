import {
  provideVSCodeDesignSystem,
  Button,
  vsCodeButton,
} from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(vsCodeButton());

const vscode = acquireVsCodeApi();

window.addEventListener("load", main);

function setListener(id: string, func: Function) {
  const button = document.getElementById(id) as Button;
  if (button) {
    button.addEventListener("click", () => func());
  }
}

function main() {
  setListener("thumbsup-button", sendThumbsup);
  setListener("thumbsdown-button", sendThumbsdown);
  changeDisplay("feedbackContainer", "flex");
}

function changeDisplay(className: string, displayState: string) {
  const elements = document.getElementsByClassName(className);
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i] as HTMLElement;
    element.style.display = displayState;
  }
}

function sendThumbsup() {
  vscode.postMessage({ command: "thumbsUp" });
}

function sendThumbsdown() {
  vscode.postMessage({ command: "thumbsDown" });
}
