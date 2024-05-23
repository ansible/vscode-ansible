import {
  provideVSCodeDesignSystem,
  Button,
  vsCodeButton,
} from "@vscode/webview-ui-toolkit";
import { ThumbsUpDownAction } from "../../../../definitions/lightspeed";

provideVSCodeDesignSystem().register(vsCodeButton());

const vscode = acquireVsCodeApi();

window.addEventListener("load", main);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setListener(id: string, func: any) {
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
  const thumbsUpButton = document.getElementById("thumbsup-button") as Button;
  const thumbsDownButton = document.getElementById(
    "thumbsdown-button",
  ) as Button;
  thumbsUpButton.setAttribute("class", "iconButtonSelected");
  thumbsDownButton.setAttribute("class", "iconButton");
  vscode.postMessage({
    command: "thumbsUp",
    action: ThumbsUpDownAction.UP,
  });
}

function sendThumbsdown() {
  const thumbsUpButton = document.getElementById("thumbsup-button") as Button;
  const thumbsDownButton = document.getElementById(
    "thumbsdown-button",
  ) as Button;
  thumbsUpButton.setAttribute("class", "iconButton");
  thumbsDownButton.setAttribute("class", "iconButtonSelected");
  vscode.postMessage({
    command: "thumbsDown",
    action: ThumbsUpDownAction.DOWN,
  });
}
