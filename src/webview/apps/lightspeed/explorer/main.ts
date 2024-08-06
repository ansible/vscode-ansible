import {
  allComponents,
  provideVSCodeDesignSystem,
  Button,
} from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(allComponents);

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
  setListener("lightspeed-explorer-connect", lightspeedConnect);
  setListener(
    "lightspeed-explorer-playbook-explanation-submit",
    lightspeedExplorerPlaybookExplanation,
  );

  const explainForm = document.getElementById("explainForm-button-container");
  const htmlContent: string = document.documentElement.outerHTML;
  if (htmlContent.includes("Looks like there is no model set for your organization.")) {
    if (explainForm) {
      explainForm.style.display = "none"
    }
  }
}

function lightspeedConnect() {
  vscode.postMessage({ command: "connect" });
}

function lightspeedExplorerPlaybookExplanation() {
  vscode.postMessage({ command: "explain" });
}
