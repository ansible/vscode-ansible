import { Disposable, Webview, window, Uri } from "vscode";
import { getUri } from "../../utils/getUri";
import { getNonce } from "../../utils/getNonce";
import { lightSpeedManager } from "../../../extension";
import { FeedbackRequestParams } from "../../../interfaces/lightspeed";

export function getWebviewContent(webview: Webview, extensionUri: Uri) {
  const webviewUri = getUri(webview, extensionUri, [
    "out",
    "client",
    "webview",
    "apps",
    "lightspeed",
    "main.js",
  ]);
  const styleUri = getUri(webview, extensionUri, ["media", "style.css"]);
  const nonce = getNonce();

  return /*html*/ `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="${styleUri}">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
      <title>Ansible Lightspeed Feedback!</title>
    </head>
    <body>
      <form id="feedback-form">
        <section class="component-container">
          <h3>How was your experience?</h3>
          <section class="sentiment-button">
            <div class="sentiment-selector">
                <input id="very-negative" value=1 type="radio" name="sentiment" />
                <label class="sentiment very-negative" for="very-negative"></label>
                <input id="negative" value=2 type="radio" name="sentiment" />
                <label class="sentiment negative"for="negative"></label>
                <input id="neutral" value=3 type="radio" name="sentiment" />
                <label class="sentiment neutral"for="neutral"></label>
                <input id="positive" value=4 type="radio" name="sentiment" />
                <label class="sentiment positive"for="positive"></label>
                <input id="very-positive" value=5 type="radio" name="sentiment" />
                <label class="sentiment very-positive"for="very-positive"></label>
            </div>
          </section>
        </section>
        <section class="component-section">
            <p class="required">Tell us why?</p>
            <vscode-text-area maxlength="512" cols="29" resize="both" id="sentiment-comment"></vscode-text-area>
        </section>
        <section class="component-section">
            <input type="checkbox" id="sentiment-data-sharing-checkbox">
            <label for="sentiment-data-sharing-checkbox">I understand that feedback is shared with Red Hat and IBM.</label>
        </section>
        <section class="component-section">
            <vscode-button id="sentiment-submit" disabled>Send</vscode-button>
        </section>
        <vscode-divider></vscode-divider>
        <section class="component-container">
            <h3>Tell us more</h3>
              <section class="component-section">
                <vscode-dropdown id="issue-type-dropdown" class="issue-dropdown">
                  <vscode-option selected value="select-issue-type">Select Issue type</vscode-option>
                  <vscode-option value="bug-report">Bug report</vscode-option>
                  <vscode-option value="feature-request">Feature request</vscode-option>
                  <vscode-option value="suggestion-feedback">Suggestion feedback</vscode-option>
                </vscode-dropdown>
              </section>
                <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
          </form>
    </body>
  </html>
        `;
}

export function setWebviewMessageListener(
  webview: Webview,
  disposables: Disposable[] = [],
) {
  webview.onDidReceiveMessage(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (message: any) => {
      console.log(
        `User feedback message received: ${JSON.stringify(message)}}`,
      );
      const error = message.error;
      let userFeedback: FeedbackRequestParams | undefined;
      if (error) {
        window.showErrorMessage(error);
        return;
      } else {
        if (message.sentiment) {
          let sentimentValue: number | undefined = undefined;
          try {
            sentimentValue = parseInt(message.sentiment.value, 10);
          } catch (error) {
            console.error(`Error parsing value: ${error}`);
            window.showErrorMessage(`Invalid sentiment value: ${error}`);
          }
          if (sentimentValue === undefined) {
            return;
          }

          userFeedback = {
            sentimentFeedback: {
              value: sentimentValue,
              feedback: message.sentiment.feedback,
            },
          };
        } else if (message.issue) {
          const issueType = message.issue.type;
          if (["bug-report", "feature-request"].includes(issueType)) {
            userFeedback = {
              issueFeedback: {
                type: issueType,
                title: message.issue.title,
                description: message.issue.description,
              },
            };
          } else if (issueType === "suggestion-feedback") {
            userFeedback = {
              suggestionQualityFeedback: {
                prompt: message.issue.prompt,
                providedSuggestion: message.issue.provided,
                expectedSuggestion: message.issue.expected,
                additionalComment: message.issue.additionalComment,
              },
            };
          }
        }
      }
      if (userFeedback && lightSpeedManager) {
        lightSpeedManager.apiInstance.feedbackRequest(userFeedback, true, true);
      }
    },
    undefined,
    disposables,
  );
}
