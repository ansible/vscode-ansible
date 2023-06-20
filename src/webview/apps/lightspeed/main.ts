import {
  allComponents,
  provideVSCodeDesignSystem,
  Button,
  Dropdown,
  TextArea,
  TextField,
} from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(allComponents);

// Get access to the VS Code API from within the webview context
const vscode = acquireVsCodeApi();

// Just like a regular webpage we need to wait for the webview
// DOM to load before we can reference any of the HTML elements
// or toolkit components
window.addEventListener("load", main);

// Main function that gets executed once the webview DOM loads
function main() {
  const feedbackForm = document.getElementById(
    "feedback-form"
  ) as HTMLFormElement;
  const issueTypeDropdown = document.getElementById(
    "issue-type-dropdown"
  ) as Dropdown;

  const bugReportSection = document.createElement("section");
  bugReportSection.classList.add("component-row");

  const featureRequestSection = document.createElement("section");
  featureRequestSection.classList.add("component-row");

  const suggestionFeedbackSection = document.createElement("section");
  suggestionFeedbackSection.classList.add("component-row");

  issueTypeDropdown.addEventListener("change", () => {
    const selectedValue = issueTypeDropdown.value;
    bugReportSection.remove();
    featureRequestSection.remove();
    suggestionFeedbackSection.remove();

    if (selectedValue === "bug-report") {
      bugReportSection.innerHTML = `
          <section class="component-section">
            <p class="required">Title</p>
            <vscode-text-field size="30" id="issue-title" placeholder="Please enter a title" />
          </section>
          <section class="component-section">
            <p class="required">Steps to reproduce</p>
            <vscode-text-area id="issue-description" cols="29" maxlength="4096" placeholder="Please enter details" resize="both"/>
          </section>
          <section class="component-section">
            <vscode-button id="issue-submit-button">Submit</vscode-button>
        </section>
      `;
      feedbackForm.append(bugReportSection);
    } else if (selectedValue === "feature-request") {
      featureRequestSection.innerHTML = `
        <section class="component-section">
          <p class="required">Title</p>
          <vscode-text-field size="30" id="issue-title" placeholder="Please enter a title" />
        </section>
        <section class="component-section">
          <p class="required">Description</p>
          <vscode-text-area id="issue-description" cols="29" maxlength="4096" placeholder="Please enter details" resize="both" />
        </section>
        <section class="component-section">
          <vscode-button id="issue-submit-button">Submit</vscode-button>
        </section>
      `;
      feedbackForm.appendChild(featureRequestSection);
    } else if (selectedValue === "suggestion-feedback") {
      suggestionFeedbackSection.innerHTML = `
        <section class="component-section" class="issue-dropdown">
          <p class="required">Prompt</p>
          <vscode-text-area id="suggestion-prompt" cols="29" class="m-b-10" placeholder="Copy and Paste the file content till the end of task name description" resize="both" />
        </section>
        <section class="component-section">
          <p class="required">Provided Suggestion</p>
          <vscode-text-area id="suggestion-provided" cols="29" class="m-b-10" placeholder="Provided Suggestion by Ansible Lightspeed" resize="both" />
        </section>
        <section class="component-section">
          <p class="required">Expected Suggestion</p>
          <vscode-text-area id="suggestion-expected" cols="29" class="m-b-10" placeholder="Your Expected Suggestion" resize="both" />
        </section>
        <section class="component-section">
          <p class="required">Why was modification required?</p>
          <vscode-text-area id="suggestion-additional-comment" cols="29" class="m-b-10" placeholder="Please enter details" resize="both" />
        </section>
        <section class="component-section">
            <vscode-button id="issue-submit-button">Submit</vscode-button>
        </section>
      `;

      feedbackForm.appendChild(suggestionFeedbackSection);
    } else if (selectedValue === "select-issue-type") {
      bugReportSection.remove();
      featureRequestSection.remove();
      suggestionFeedbackSection.remove();
    }
    handleIssueFeedback();
  });
  handleSentimentFeedback();
}

function handleSentimentFeedback() {
  let sentimentValue: string | undefined = undefined;

  const sentimentCommentTextArea = document.getElementById(
    "sentiment-comment"
  ) as TextArea;

  const sentimentSendButton = document.getElementById(
    "sentiment-submit"
  ) as Button;

  sentimentSendButton.addEventListener("click", () => {
    const sentimentSelector = document.querySelector(
      ".sentiment-selector"
    ) as HTMLDivElement;
    const selectedOption = sentimentSelector.querySelector(
      "input[type=radio]:checked"
    ) as HTMLInputElement;

    if (selectedOption) {
      sentimentValue = selectedOption.value;
    } else {
      vscode.postMessage({
        error: "Please select sentiment rating.",
      });
      return;
    }
    if (sentimentCommentTextArea.value === "") {
      vscode.postMessage({
        error: "Please tell us the reason for your rating.",
      });
      return;
    }
    const userFeedbackData = {
      sentiment: {
        value: sentimentValue,
        feedback: sentimentCommentTextArea.value,
      },
    };
    console.log(`Sentiment value: ${sentimentValue}`);
    console.log(`Sentiment comment: ${sentimentCommentTextArea.value}`);
    vscode.postMessage(userFeedbackData);
    sentimentCommentTextArea.value = "";
  });
}

function handleIssueFeedback() {
  const issueSubmitButton = document.getElementById(
    "issue-submit-button"
  ) as Button;

  const issueTypeDropdown = document.getElementById(
    "issue-type-dropdown"
  ) as Dropdown;

  const issueTitleTextArea = document.getElementById(
    "issue-title"
  ) as TextField;

  const issueDescriptionTextArea = document.getElementById(
    "issue-description"
  ) as TextArea;

  issueSubmitButton.addEventListener("click", () => {
    console.log(`Issue type: ${issueTypeDropdown.value}`);
    if (
      issueTypeDropdown.value === "bug-report" ||
      issueTypeDropdown.value === "feature-request"
    ) {
      if (issueTitleTextArea.value === "") {
        vscode.postMessage({
          error: "Please enter an issue title.",
        });
        return;
      }
      if (issueDescriptionTextArea.value === "") {
        vscode.postMessage({
          error: "Please enter an issue description.",
        });
        return;
      }

      const userFeedbackData = {
        issue: {
          type: issueTypeDropdown.value,
          title: issueTitleTextArea.value,
          description: issueDescriptionTextArea.value,
        },
      };
      vscode.postMessage(userFeedbackData);
      issueTitleTextArea.value = "";
      issueDescriptionTextArea.value = "";
    } else if (issueTypeDropdown.value === "suggestion-feedback") {
      const suggestionPromptTextArea = document.getElementById(
        "suggestion-prompt"
      ) as TextArea;

      const suggestionProvidedTextArea = document.getElementById(
        "suggestion-provided"
      ) as TextArea;

      const suggestionExpectedTextArea = document.getElementById(
        "suggestion-expected"
      ) as TextArea;

      const suggestionAdditionalCommentTextArea = document.getElementById(
        "suggestion-additional-comment"
      ) as TextArea;

      if (suggestionPromptTextArea.value === "") {
        vscode.postMessage({
          error: "Please enter a prompt for suggestion.",
        });
        return;
      }
      if (suggestionProvidedTextArea.value === "") {
        vscode.postMessage({
          error: "Please enter a provided suggestion.",
        });
        return;
      }
      if (suggestionExpectedTextArea.value === "") {
        vscode.postMessage({
          error: "Please enter an expected suggestion.",
        });
        return;
      }
      if (suggestionAdditionalCommentTextArea.value === "") {
        vscode.postMessage({
          error: "Please enter details for modification.",
        });
        return;
      }

      const userFeedbackData = {
        issue: {
          type: issueTypeDropdown.value,
          prompt: suggestionPromptTextArea.value,
          provided: suggestionProvidedTextArea.value,
          expected: suggestionExpectedTextArea.value,
          additionalComment: suggestionAdditionalCommentTextArea.value,
        },
      };
      vscode.postMessage(userFeedbackData);
      suggestionPromptTextArea.value = "";
      suggestionProvidedTextArea.value = "";
      suggestionExpectedTextArea.value = "";
      suggestionAdditionalCommentTextArea.value = "";
    }
  });
}
