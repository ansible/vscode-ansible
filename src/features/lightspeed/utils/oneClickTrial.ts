import * as vscode from "vscode";
import { IError } from "@ansible/ansible-language-server/src/interfaces/lightspeedApi";
import { lightSpeedManager } from "../../../extension";
import { LightSpeedCommands } from "../../../definitions/lightspeed";

export class OneClickTrialProvider {
  public mapError(mappedError: IError): IError {
    // Don't show "Apply for Trial" message if experimental features are not enabled
    if (
      mappedError?.code === "permission_denied__can_apply_for_trial" &&
      !lightSpeedManager.lightspeedExplorerProvider
        .lightspeedExperimentalEnabled
    ) {
      return {
        code: "permission_denied__user_has_no_subscription",
        message:
          "Your organization does not have a subscription. Please contact your administrator.",
      };
    }
    return mappedError;
  }

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
