import * as vscode from "vscode";
import { MainPanel } from "@src/features/contentCreator/vue/views/createExecutionEnvPanel";

export const CreateExecutionEnv = {
  render(context: vscode.ExtensionContext) {
    MainPanel.render(context);
  },
};
