import * as vscode from "vscode";
import * as yaml from "yaml";

export function shouldRequestInlineSuggestions(
  documentContent: string
): boolean {
  let parsedAnsibledocument = undefined;
  try {
    parsedAnsibledocument = yaml.parse(documentContent, { keepCstNodes: true });
  } catch (err) {
    vscode.window.showErrorMessage(
      `Project Wisdom expects valid YAML synatax to provide inline suggestions. Error: ${err}`
    );
    return false;
  }
  // if the file is empty, we don't want to request inline suggestions
  if (parsedAnsibledocument === undefined) {
    return false;
  }

  // check if YAML is a list, if not it is not a valid Ansible document
  if (
    typeof parsedAnsibledocument === "object" &&
    !Array.isArray(parsedAnsibledocument)
  ) {
    return false;
  }

  const lastObject = parsedAnsibledocument[parsedAnsibledocument.length - 1];
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
