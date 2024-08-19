import * as vscode from "vscode";
import { IError } from "./errors";
import { LightSpeedCommands } from "../../../definitions/lightspeed";

export class OneClickTrialProvider {
  public async showPopup(error?: IError): Promise<boolean> {
    if (error?.code === "permission_denied__can_apply_for_trial") {
      const buttonLabel = "Start a trial";
      const selection = await vscode.window.showInformationMessage(
        "Ansible Lightspeed is not configured for your organization, click here to start a 90-day trial.",
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
}

const oneClickTrialProvider = new OneClickTrialProvider();

export function getOneClickTrialProvider(): OneClickTrialProvider {
  return oneClickTrialProvider;
}
