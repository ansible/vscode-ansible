import {
  allComponents,
  provideVSCodeDesignSystem,
  Button,
  Dropdown,
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
  // To get improved type annotations/IntelliSense the associated class for
  // a given toolkit component can be imported and used to type cast a reference
  // to the element (i.e. the `as Button` syntax)
  const feedbackForm = document.getElementById(
    "feedback-form"
  ) as HTMLFormElement;
  const issueTypeDropdown = document.getElementById(
    "issue-type-dropdown"
  ) as Dropdown;

  const issueSubmitButton = document.getElementById(
    "issue-submit-button"
  ) as Button;

  const textAreas = document.querySelectorAll("vscode-text-area");

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
            <vscode-dropdown id="source-dropdown">
              <vscode-option selected value="select-source">Select source</vscode-option>
              <vscode-option value="ansible-extension">Extension</vscode-option>
              <vscode-option value="ansible-lightspeed">Lightspeed</vscode-option>
            </vscode-dropdown>
          </section>
          <section class="component-example">
            <vscode-text-field size="100" id="issue-title" placeholder="Please enter a title">Title</vscode-text-field>
          </section>
          <section class="component-example">
            <vscode-text-area id="steps-to-reproduce" required maxlength="4096" placeholder="Please enter details" resize="both">Steps to reproduce</vscode-text-area>
          </section>
          <section class="component-example">
            <vscode-button id="issue-submit-button">Submit</vscode-button>
        </section>
      `;
      feedbackForm.append(bugReportSection);
    } else if (selectedValue === "feature-request") {
      featureRequestSection.innerHTML = `
        <section class="component-example">
          <vscode-dropdown id="source-dropdown">
            <vscode-option selected value="select-source">Select source</vscode-option>
            <vscode-option value="ansible-extension">Extension</vscode-option>
            <vscode-option value="ansible-lightspeed">Lightspeed</vscode-option>
          </vscode-dropdown>
        </section>
        <section class="component-example">
          <vscode-text-field size="100" id="issue-title" placeholder="Please enter a title">Title</vscode-text-field>
        </section>
        <section class="component-example">
          <vscode-text-area id="steps-to-reproduce" required maxlength="4096" placeholder="Please enter details" resize="both">Description</vscode-text-area>
        </section>
        <section class="component-example">
          <vscode-button id="issue-submit-button">Submit</vscode-button>
        </section>
      `;
      feedbackForm.appendChild(featureRequestSection);
    } else if (selectedValue === "suggestion-feedback") {
      suggestionFeedbackSection.innerHTML = `
        <section class="component-example">
          <vscode-text-area id="suggestion-prompt" required placeholder="Copy and Paste the file content till the end of task name description" resize="both">Prompt</vscode-text-area>
        </section>
        <section class="component-example">
          <vscode-text-area id="suggestion-provided" required placeholder="Provided Suggestion by Ansible Lightspeed" resize="both">Provided Suggestion</vscode-text-area>
        </section>
        <section class="component-example">
          <vscode-text-area id="suggestion-expected" required placeholder="Your Expected Suggestion" resize="both">Expected Suggestion</vscode-text-area>
        </section>
        <section class="component-example">
          <vscode-text-area id="suggestion-additional-comment" required placeholder="Please enter details" resize="both">Why was modification required?</vscode-text-area>
        </section>
        <section class="sentiment-button">
            <vscode-button id="suggestion-thumbs-up">👍</vscode-button>
            <vscode-button id="suggestion-thumbs-down">👎</vscode-button>
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

  issueSubmitButton.addEventListener("click", () => {
    textAreas.forEach((textarea) => {
      textarea.textContent = "";
    });
  });
}
