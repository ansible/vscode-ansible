import {
  allComponents,
  provideVSCodeDesignSystem,
  Button,
  Dropdown,
  TextArea,
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
          <section class="component-example">
            <vscode-dropdown id="source-dropdown" class="issue-dropdown">
              <vscode-option selected value="select-source">Select source</vscode-option>
              <vscode-option value="ansible-extension">Extension</vscode-option>
              <vscode-option value="ansible-lightspeed">Lightspeed</vscode-option>
            </vscode-dropdown>
          </section>
          <section class="component-example">
            <p class="required">Title</p>
            <vscode-text-field size="30" id="issue-title" placeholder="Please enter a title" />
          </section>
          <section class="component-example">
            <p class="required">Steps to reproduce</p>
            <vscode-text-area id="issue-description" cols="29" maxlength="4096" placeholder="Please enter details" resize="both"/>
          </section>
          <section class="component-example">
            <vscode-button id="issue-submit-button">Submit</vscode-button>
        </section>
      `;
      feedbackForm.append(bugReportSection);
    } else if (selectedValue === "feature-request") {
      featureRequestSection.innerHTML = `
        <section class="component-example">
          <vscode-dropdown id="source-dropdown" class="issue-dropdown">
            <vscode-option selected value="select-source">Select source</vscode-option>
            <vscode-option value="ansible-extension">Extension</vscode-option>
            <vscode-option value="ansible-lightspeed">Lightspeed</vscode-option>
          </vscode-dropdown>
        </section>
        <section class="component-example">
          <p class="required">Title</p>
          <vscode-text-field size="30" id="issue-title" placeholder="Please enter a title" />
        </section>
        <section class="component-example">
          <p class="required">Description</p>
          <vscode-text-area id="issue-description" cols="29" maxlength="4096" placeholder="Please enter details" resize="both" />
        </section>
        <section class="component-example">
          <vscode-button id="issue-submit-button">Submit</vscode-button>
        </section>
      `;
      feedbackForm.appendChild(featureRequestSection);
    } else if (selectedValue === "suggestion-feedback") {
      suggestionFeedbackSection.innerHTML = `
        <section class="component-example" class="issue-dropdown">
          <p class="required">Prompt</p>
          <vscode-text-area id="suggestion-prompt" cols="29" class="m-b-10" placeholder="Copy and Paste the file content till the end of task name description" resize="both" />
        </section>
        <section class="component-example">
          <p class="required">Provided Suggestion</p>
          <vscode-text-area id="suggestion-provided" cols="29" class="m-b-10" placeholder="Provided Suggestion by Ansible Lightspeed" resize="both" />
        </section>
        <section class="component-example">
          <p class="required">Expected Suggestion</p>
          <vscode-text-area id="suggestion-expected" cols="29" class="m-b-10" placeholder="Your Expected Suggestion" resize="both" />
        </section>
        <section class="component-example">
          <p class="required">Why was modification required?</p>
          <vscode-text-area id="suggestion-additional-comment" cols="29" class="m-b-10" placeholder="Please enter details" resize="both" />
        </section>
        <section class="sentiment-button">
            <vscode-button appearance="icon" id="suggestion-thumbs-up">👍</vscode-button>
            <vscode-button appearance="icon" id="suggestion-thumbs-down">👎</vscode-button>
        </section>
        <section class="component-example">
            <vscode-button id="issue-submit-button">Submit</vscode-button>
        </section>
      `;

      feedbackForm.appendChild(suggestionFeedbackSection);
    } else if (selectedValue === "select-issue-type") {
      bugReportSection.remove();
      featureRequestSection.remove();
      suggestionFeedbackSection.remove();
    }
  });

  handleSentimentFeedback();
  handleIssueFeedback();
}

function handleSentimentFeedback() {
  let sentimentValue: string | undefined = undefined;

  const sentimentButtons = document.querySelectorAll(
    ".sentiment-button > vscode-button"
  );

  sentimentButtons.forEach((button) => {
    button.addEventListener("click", () => {
      sentimentButtons.forEach((button) => {
        button.classList.remove("selected");
      });
      button.classList.add("selected");
      sentimentValue = button.textContent ?? undefined;
    });
  });

  const sentimentCommentTextArea = document.getElementById(
    "sentiment-comment"
  ) as TextArea;

  const sentimentSendButton = document.getElementById(
    "sentiment-submit"
  ) as Button;

  sentimentSendButton.addEventListener("click", () => {
    const userFeedbackData = {
      sentiment: {
        value: sentimentValue,
        comment: sentimentCommentTextArea.textContent,
      },
    };
    vscode.postMessage(userFeedbackData);
    sentimentCommentTextArea.textContent = "";
  });
}

function handleIssueFeedback() {
  const issueSubmitButton = document.getElementById(
    "issue-submit-button"
  ) as Button;

  const issueTypeDropdown = document.getElementById(
    "issue-type-dropdown"
  ) as Dropdown;

  const issueTitleTextArea = document.getElementById("issue-title") as TextArea;

  const sourceDropdown = document.getElementById("source-dropdown") as Dropdown;

  const issueDescriptionTextArea = document.getElementById(
    "issue-description"
  ) as TextArea;

  let thumbsUpDownValue: string | undefined = undefined;
  const thumbsUpButton = document.getElementById(
    "suggestion-thumbs-up"
  ) as Button;
  const thumbsDownButton = document.getElementById(
    "suggestion-thumbs-down"
  ) as Button;
  thumbsUpButton.addEventListener("click", () => {
    thumbsUpButton.classList.add("selected");
    thumbsDownButton.classList.remove("selected");
    thumbsUpDownValue = "1";
  });
  thumbsDownButton.addEventListener("click", () => {
    thumbsUpButton.classList.remove("selected");
    thumbsDownButton.classList.add("selected");
    thumbsUpDownValue = "0";
  });

  issueSubmitButton.addEventListener("click", () => {
    if (
      issueTypeDropdown.value === "bug-report" ||
      issueTypeDropdown.value === "feature-request"
    ) {
      if (sourceDropdown.value === "select-source") {
        vscode.postMessage({
          error: "Please select a source",
        });
        return;
      }
      if (issueTitleTextArea.textContent === "") {
        vscode.postMessage({
          error: "Please enter a title",
        });
        return;
      }
      if (issueDescriptionTextArea.textContent === "") {
        vscode.postMessage({
          error: "Please enter a description",
        });
        return;
      }

      const userFeedbackData = {
        issue: {
          type: issueTypeDropdown.value,
          title: issueTitleTextArea.textContent,
          description: issueDescriptionTextArea.textContent,
        },
      };
      vscode.postMessage(userFeedbackData);
      issueTitleTextArea.textContent = "";
      issueDescriptionTextArea.textContent = "";
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

      if (suggestionPromptTextArea.textContent === "") {
        vscode.postMessage({
          error: "Please enter a prompt",
        });
        return;
      }
      if (suggestionProvidedTextArea.textContent === "") {
        vscode.postMessage({
          error: "Please enter a provided suggestion",
        });
        return;
      }
      if (suggestionExpectedTextArea.textContent === "") {
        vscode.postMessage({
          error: "Please enter an expected suggestion",
        });
        return;
      }

      const userFeedbackData = {
        suggestion: {
          prompt: suggestionPromptTextArea.textContent,
          provided: suggestionProvidedTextArea.textContent,
          expected: suggestionExpectedTextArea.textContent,
          additionalComment: suggestionAdditionalCommentTextArea.textContent,
          thumbsUpDown: thumbsUpDownValue,
        },
      };
      vscode.postMessage(userFeedbackData);
      suggestionPromptTextArea.textContent = "";
      suggestionProvidedTextArea.textContent = "";
      suggestionExpectedTextArea.textContent = "";
      suggestionAdditionalCommentTextArea.textContent = "";
      thumbsDownButton.classList.remove("selected");
      thumbsUpButton.classList.remove("selected");
    }
  });
}
