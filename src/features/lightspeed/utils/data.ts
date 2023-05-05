import * as vscode from "vscode";
import * as yaml from "yaml";

export function shouldRequestInlineSuggestions(
  documentContent: string
): boolean {
  let parsedAnsibleDocument = undefined;
  try {
    parsedAnsibleDocument = yaml.parse(documentContent, { keepCstNodes: true });
  } catch (err) {
    vscode.window.showErrorMessage(
      `Ansible Lightspeed expects valid YAML syntax to provide inline suggestions. Error: ${err}`
    );
    return false;
  }
  // if the file is empty, we don't want to request inline suggestions
  if (parsedAnsibleDocument === undefined) {
    return false;
  }

  // check if YAML is a list, if not it is not a valid Ansible document
  if (
    typeof parsedAnsibleDocument === "object" &&
    !Array.isArray(parsedAnsibleDocument)
  ) {
    vscode.window.showErrorMessage(
      "Ansible Lightspeed expects valid Ansible syntax. For playbook files it should be a list of plays and for tasks files it should be list of tasks."
    );
    return false;
  }

  const lastObject = parsedAnsibleDocument[parsedAnsibleDocument.length - 1];
  if (typeof lastObject !== "object") {
    return false;
  }
  // for the last entry in list check if the inline suggestion
  // triggered is in Ansible play context by checking for "hosts" keyword.
  const objectKeys = Object.keys(lastObject);
  if (
    objectKeys[objectKeys.length - 1] === "name" &&
    objectKeys.includes("hosts")
  ) {
    return false;
  }

  return true;
}
