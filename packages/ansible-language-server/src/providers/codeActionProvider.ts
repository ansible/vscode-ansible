import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Command,
  Connection,
  Diagnostic,
} from "vscode-languageserver";
import { WorkspaceFolderContext } from "@src/services/workspaceManager.js";
import { URI } from "vscode-uri";

export async function provideCodeActions(
  params: CodeActionParams,
  context: WorkspaceFolderContext | undefined,
  connection: Connection,
): Promise<(CodeAction | Command)[]> {
  if (!context) {
    return [];
  }

  const apmeFixableDiagnostics = params.context.diagnostics.filter(
    (d) =>
      d.source === "Ansible [apme]" &&
      d.data &&
      (d.data as { fixable?: boolean }).fixable === true,
  );

  if (apmeFixableDiagnostics.length === 0) {
    return [];
  }

  const docPath = URI.parse(params.textDocument.uri).path;

  const codeAction: CodeAction = {
    title: `Fix all apme violations (${apmeFixableDiagnostics.length} fixable)`,
    kind: CodeActionKind.QuickFix,
    diagnostics: apmeFixableDiagnostics,
    command: {
      title: "Fix all apme violations",
      command: "ansible.apme.remediate",
      arguments: [docPath],
    },
  };

  return [codeAction];
}
