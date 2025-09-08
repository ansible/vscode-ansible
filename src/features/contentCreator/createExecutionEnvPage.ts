import * as vscode from "vscode";
import { MainPanel } from "./vue/views/createExecutionEnvPanel";

export class CreateExecutionEnv {
  public static render(context: vscode.ExtensionContext) {
    MainPanel.render(context);
  }
}
