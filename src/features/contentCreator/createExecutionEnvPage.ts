import * as vscode from "vscode";
import { MainPanel } from "./vue/views/createExecutionEnvPanel";

export const CreateExecutionEnv = {
  render(context: vscode.ExtensionContext) {
    MainPanel.render(context);
  },
};
