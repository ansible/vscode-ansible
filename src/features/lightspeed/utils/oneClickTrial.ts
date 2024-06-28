import * as vscode from "vscode";
import { IError } from "@ansible/ansible-language-server/src/interfaces/lightspeedApi";
import { lightSpeedManager } from "../../../extension";
import { LightSpeedCommands } from "../../../definitions/lightspeed";

export async function showTrialInfoPopup(error?: IError): Promise<boolean> {
  if (
    lightSpeedManager.lightspeedExplorerProvider
      .lightspeedExperimentalEnabled &&
    error?.code === "permission_denied__user_has_no_subscription"
  ) {
    const buttonLabel = "Start my Trial period, It's free!";
    const selection = await vscode.window.showInformationMessage(
      "Oh! You don't have an active Lightspeed Subscription",
      buttonLabel,
    );
    if (selection === buttonLabel) {
      vscode.commands.executeCommand(
        LightSpeedCommands.LIGHTSPEED_OPEN_TRIAL_PAGE,
      );
    }
    return true; // This suppresses to show the standard error message.
  }
  return false;
}
