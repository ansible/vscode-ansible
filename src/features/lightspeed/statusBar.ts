import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { LightSpeedAPI } from "./api";
import { SettingsManager } from "../../settings";
import {
  ANSIBLE_EXTENSION_REPOSITORY_URL,
  LIGHTSPEED_FEEDBACK_FORM_URL,
  LIGHTSPEED_REPORT_EMAIL_ADDRESS,
  LightSpeedCommands,
} from "../../definitions/constants";
import { FeedbackRequestParams } from "../../definitions/lightspeed";

const sentimentOptions = [
  "😀 Very positive",
  "🙂 Positive",
  "😐 Neutral",
  "🙁 Negative",
  "😞 Very negative",
];

const sentimentMap: { [key: string]: number } = {
  "😀 Very positive": 5,
  "🙂 Positive": 4,
  "😐 Neutral": 3,
  "🙁 Negative": 2,
  "😞 Very negative": 1,
};

export class LightspeedStatusBar {
  private apiInstance: LightSpeedAPI;
  private context;
  public client;
  public settingsManager: SettingsManager;
  public statusBar: vscode.StatusBarItem;

  constructor(
    apiInstance: LightSpeedAPI,
    context: vscode.ExtensionContext,
    client: LanguageClient,
    settingsManager: SettingsManager
  ) {
    this.apiInstance = apiInstance;
    this.context = context;
    this.client = client;
    this.settingsManager = settingsManager;
    // create a new project lightspeed status bar item that we can manage
    this.statusBar = this.initialiseStatusBar();
    this.updateLightSpeedStatusbar();
  }

  private initialiseStatusBar(): vscode.StatusBarItem {
    // create a new status bar item that we can manage
    const lightSpeedStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    lightSpeedStatusBarItem.command =
      LightSpeedCommands.LIGHTSPEED_STATUS_BAR_CLICK;
    lightSpeedStatusBarItem.text = "Lightspeed";
    this.context.subscriptions.push(lightSpeedStatusBarItem);
    return lightSpeedStatusBarItem;
  }

  private handleStatusBar() {
    if (!this.client.isRunning()) {
      return;
    }
    if (
      this.settingsManager.settings.lightSpeedService.enabled &&
      this.settingsManager.settings.lightSpeedService.suggestions.enabled
    ) {
      this.statusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.prominentForeground"
      );
    } else {
      this.statusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    }
    this.statusBar.show();
  }

  public updateLightSpeedStatusbar(): void {
    if (
      vscode.window.activeTextEditor?.document.languageId !== "ansible" ||
      !this.settingsManager.settings.lightSpeedService.enabled
    ) {
      this.statusBar.hide();
      return;
    }

    this.handleStatusBar();
  }

  async feedbackHandler() {
    const takeSurveyButton = "Take Survey";
    const codeSuggestionButton = "Code Suggestion improvement";
    const extensionIssueButton = "Extension: Issue";
    const extensionFeatureButton = "Extension: Feature";
    const emailButton = "Email";

    const feedbackInput = await vscode.window.showInformationMessage(
      "Ansible Lightspeed with Watson Code Assistant",
      { modal: true, detail: "Tell us more" },
      takeSurveyButton,
      codeSuggestionButton,
      extensionIssueButton,
      extensionFeatureButton,
      emailButton
    );
    if (!feedbackInput || feedbackInput === undefined) {
      return;
    }
    if (feedbackInput === takeSurveyButton) {
      // open a URL in the default browser
      vscode.env.openExternal(vscode.Uri.parse(LIGHTSPEED_FEEDBACK_FORM_URL));
    } else if (feedbackInput === codeSuggestionButton) {
      const prompt = await vscode.window.showInputBox({
        prompt: "Prompt",
        placeHolder:
          "Copy and paste the file content till the end of task name description line",
        ignoreFocusOut: true,
        validateInput: (value: string) => {
          if (!value) {
            return "Prompt cannot be empty";
          }
        },
      });
      const providedSuggestion = await vscode.window.showInputBox({
        prompt: "Suggestion provided",
        placeHolder:
          "Copy and paste the suggestion provided by Lightspeed here with whitespaces intact.",
        ignoreFocusOut: true,
        validateInput: (value: string) => {
          if (!value) {
            return "Suggestion provided cannot be empty";
          }
        },
      });
      const expectedSuggestion = await vscode.window.showInputBox({
        prompt: "Expected Suggestion",
        placeHolder: "Copy and paste the expected suggestion here.",
        ignoreFocusOut: true,
        validateInput: (value: string) => {
          if (!value) {
            return "Expected Suggestion cannot be empty";
          }
        },
      });
      const additionalComment = await vscode.window.showInputBox({
        prompt: "Additional comment",
        placeHolder:
          "Please describe why the change was required in the suggestion provided by Lightspeed.",
        ignoreFocusOut: true,
      });
      if (prompt && providedSuggestion && expectedSuggestion) {
        const inputData: FeedbackRequestParams = {
          suggestionQualityFeedback: {
            prompt: prompt,
            providedSuggestion: providedSuggestion,
            expectedSuggestion: expectedSuggestion,
            additionalComment: additionalComment,
          },
        };

        console.log(
          "[ansible-lightspeed-feedback] Event suggestionQualityFeedback sent."
        );
        this.apiInstance.feedbackRequest(inputData);
        vscode.window.showInformationMessage(
          "Thank you for your feedback on code suggestion."
        );
      }
    } else if (feedbackInput === extensionIssueButton) {
      const issueTitle = await vscode.window.showInputBox({
        prompt: "Issue title",
        placeHolder: "Describe the issue.",
        ignoreFocusOut: true,
        validateInput: (value: string) => {
          if (!value) {
            return "Issue title cannot be empty";
          }
        },
      });
      const issueDescription = await vscode.window.showInputBox({
        prompt: "Issue description",
        placeHolder: "Explain the issue.",
        ignoreFocusOut: true,
        validateInput: (value: string) => {
          if (!value) {
            return "Issue description cannot be empty.";
          }
        },
      });
      if (issueTitle && issueDescription) {
        const issueUrl = `${ANSIBLE_EXTENSION_REPOSITORY_URL}/issues/new?title=${encodeURIComponent(
          issueTitle
        )}&body=${encodeURIComponent(issueDescription)}&labels=bug`;

        vscode.env.openExternal(vscode.Uri.parse(issueUrl));
        vscode.window.showInformationMessage(
          "Thank you for your feedback on Ansible extension."
        );
      }
    } else if (feedbackInput === extensionFeatureButton) {
      const issueTitle = await vscode.window.showInputBox({
        prompt: "Feature title",
        placeHolder: "Describe the feature.",
        ignoreFocusOut: true,
        validateInput: (value: string) => {
          if (!value) {
            return "Feature title cannot be empty";
          }
        },
      });
      const issueDescription = await vscode.window.showInputBox({
        prompt: "Feature description",
        placeHolder: "Explain the feature.",
        ignoreFocusOut: true,
        validateInput: (value: string) => {
          if (!value) {
            return "Feature description cannot be empty.";
          }
        },
      });
      if (issueTitle && issueDescription) {
        const issueUrl = `${ANSIBLE_EXTENSION_REPOSITORY_URL}/issues/new?title=${encodeURIComponent(
          issueTitle
        )}&body=${encodeURIComponent(issueDescription)}&labels=enhancement`;

        vscode.env.openExternal(vscode.Uri.parse(issueUrl));
        vscode.window.showInformationMessage(
          "Thank you for your feedback on Ansible extension."
        );
      }
    } else if (feedbackInput === emailButton) {
      // open the user's default email client
      const mailtoUrl = encodeURI(`mailto:${LIGHTSPEED_REPORT_EMAIL_ADDRESS}`);
      vscode.env.openExternal(vscode.Uri.parse(mailtoUrl));
    }
  }

  async sentimentFeedbackHandler() {
    const sentimentInput = await vscode.window.showInformationMessage(
      "Ansible Lightspeed with Watson Code Assistant",
      { modal: true, detail: "How do you feel about this feature?" },
      ...sentimentOptions
    );
    if (!sentimentInput || sentimentInput === undefined) {
      return;
    }
    // Show the sentiment feedback form
    const feedback = await vscode.window.showInputBox({
      prompt: "Tell us why?",
      placeHolder: "Type your feedback here",
      ignoreFocusOut: true,
      validateInput: (value: string) => {
        if (!value) {
          return "Feedback cannot be empty";
        }
      },
    });
    if (feedback && sentimentInput in sentimentMap) {
      const sentimentValue = sentimentMap[sentimentInput];
      const inputData: FeedbackRequestParams = {
        sentimentFeedback: {
          value: sentimentValue,
          feedback: feedback,
        },
      };
      console.log(
        "[ansible-lightspeed-feedback] Event sentimentFeedback sent."
      );
      this.apiInstance.feedbackRequest(inputData);
      // Display a success message
      vscode.window.showInformationMessage(
        `Thank you for your feedback! Sentiment: ${sentimentInput}`
      );
    }
  }

  public async lightSpeedFeedbackHandler() {
    const feedbackButton = "Tell us more";
    const sentimentButton = "Sentiment";

    const inputButton = await vscode.window.showInformationMessage(
      "Ansible Lightspeed",
      { modal: false },
      sentimentButton,
      feedbackButton
    );
    if (inputButton === feedbackButton) {
      await this.feedbackHandler();
    } else if (inputButton === sentimentButton) {
      await this.sentimentFeedbackHandler();
    }
  }

  public async lightSpeedStatusBarClickHandler() {
    //await this.lightSpeedFeedbackHandler();
    vscode.commands.executeCommand(LightSpeedCommands.LIGHTSPEED_FEEDBACK);
  }
}
