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
    "lightspeed-explorer-playbook-generation-submit",
    lightspeedExplorerPlaybookGeneration,
  );
  setListener(
    "lightspeed-explorer-playbook-explanation-submit",
    lightspeedExplorerPlaybookExplanation,
  );
  setListener(
    "lightspeed-explorer-role-generation-submit",
    lightspeedExplorerRoleGeneration,
  );
  setListener(
    "lightspeed-explorer-role-explanation-submit",
    lightspeedExplorerRoleExplanation,
  );
}

function lightspeedConnect() {
  vscode.postMessage({ command: "connect" });
}

function lightspeedExplorerPlaybookGeneration() {
  vscode.postMessage({ command: "generate" });
}

function lightspeedExplorerPlaybookExplanation() {
  vscode.postMessage({ command: "explain" });
}

function lightspeedExplorerRoleGeneration() {
  vscode.postMessage({ command: "generateRole" });
}

function lightspeedExplorerRoleExplanation() {
  vscode.postMessage({ command: "explainRole" });
}
