<script setup lang="ts">
import { ref, computed } from "vue";
import { vscodeApi } from "./utils";

// Sentiment feedback state
const selectedSentiment = ref<number | null>(null);
const sentimentComment = ref("");
const sentimentDataSharingAccepted = ref(false);

// Issue feedback state
const issueType = ref<string>("select-issue-type");
const issueTitle = ref("");
const issueDescription = ref("");
const feedbackDataSharingAccepted = ref(false);

// Suggestion feedback specific fields
const suggestionPrompt = ref("");
const suggestionProvided = ref("");
const suggestionExpected = ref("");
const suggestionAdditionalComment = ref("");

// Submission state
const sentimentSubmitted = ref(false);
const issueSubmitted = ref(false);
const errorMessage = ref("");

// Computed properties for button states
const canSubmitSentiment = computed(() => {
  return (
    selectedSentiment.value !== null &&
    sentimentComment.value.trim() !== "" &&
    sentimentDataSharingAccepted.value
  );
});

const canSubmitIssue = computed(() => {
  if (!feedbackDataSharingAccepted.value) return false;

  if (issueType.value === "bug-report" || issueType.value === "feature-request") {
    return issueTitle.value.trim() !== "" && issueDescription.value.trim() !== "";
  } else if (issueType.value === "suggestion-feedback") {
    return (
      suggestionPrompt.value.trim() !== "" &&
      suggestionProvided.value.trim() !== "" &&
      suggestionExpected.value.trim() !== "" &&
      suggestionAdditionalComment.value.trim() !== ""
    );
  }
  return false;
});

// Sentiment options
const sentiments = [
  { value: 1, id: "very-negative", label: "Very Negative", emoji: "&#128542;" },
  { value: 2, id: "negative", label: "Negative", emoji: "&#128577;" },
  { value: 3, id: "neutral", label: "Neutral", emoji: "&#128528;" },
  { value: 4, id: "positive", label: "Positive", emoji: "&#128578;" },
  { value: 5, id: "very-positive", label: "Very Positive", emoji: "&#128512;" },
];

// Issue type options
const issueTypes = [
  { value: "select-issue-type", label: "Select Issue type" },
  { value: "bug-report", label: "Bug report" },
  { value: "feature-request", label: "Feature request" },
  { value: "suggestion-feedback", label: "Suggestion feedback" },
];

// Handlers
const selectSentiment = (value: number) => {
  selectedSentiment.value = value;
};

const submitSentiment = () => {
  if (!canSubmitSentiment.value) {
    if (selectedSentiment.value === null) {
      errorMessage.value = "Select sentiment rating.";
    } else if (sentimentComment.value.trim() === "") {
      errorMessage.value = "Tell us the reason for your rating.";
    }
    return;
  }

  errorMessage.value = "";
  vscodeApi.post("sentimentFeedback", {
    value: selectedSentiment.value,
    feedback: sentimentComment.value,
  });

  // Reset form
  sentimentSubmitted.value = true;
  selectedSentiment.value = null;
  sentimentComment.value = "";
  sentimentDataSharingAccepted.value = false;

  setTimeout(() => {
    sentimentSubmitted.value = false;
  }, 3000);
};

const submitIssue = () => {
  if (!canSubmitIssue.value) {
    if (issueType.value === "bug-report" || issueType.value === "feature-request") {
      if (issueTitle.value.trim() === "") {
        errorMessage.value = "Enter an issue title.";
      } else if (issueDescription.value.trim() === "") {
        errorMessage.value = "Enter an issue description.";
      }
    } else if (issueType.value === "suggestion-feedback") {
      if (suggestionPrompt.value.trim() === "") {
        errorMessage.value = "Enter details about prompt used for recommendation.";
      } else if (suggestionProvided.value.trim() === "") {
        errorMessage.value = "Enter details about recommendation provided.";
      } else if (suggestionExpected.value.trim() === "") {
        errorMessage.value = "Enter details about expected recommendation.";
      } else if (suggestionAdditionalComment.value.trim() === "") {
        errorMessage.value = "Enter details on why the modification was required.";
      }
    }
    return;
  }

  errorMessage.value = "";

  if (issueType.value === "bug-report" || issueType.value === "feature-request") {
    vscodeApi.post("issueFeedback", {
      type: issueType.value,
      title: issueTitle.value,
      description: issueDescription.value,
    });
    issueTitle.value = "";
    issueDescription.value = "";
  } else if (issueType.value === "suggestion-feedback") {
    vscodeApi.post("suggestionFeedback", {
      prompt: suggestionPrompt.value,
      provided: suggestionProvided.value,
      expected: suggestionExpected.value,
      additionalComment: suggestionAdditionalComment.value,
    });
    suggestionPrompt.value = "";
    suggestionProvided.value = "";
    suggestionExpected.value = "";
    suggestionAdditionalComment.value = "";
  }

  feedbackDataSharingAccepted.value = false;
  issueSubmitted.value = true;

  setTimeout(() => {
    issueSubmitted.value = false;
  }, 3000);
};

// Listen for error messages from extension
vscodeApi.on("errorMessage", (data: string) => {
  errorMessage.value = data;
});

// Listen for success messages
vscodeApi.on("feedbackSuccess", () => {
  errorMessage.value = "";
});
</script>

<template>
  <div id="feedback-container">
    <form id="feedback-form" @submit.prevent>
      <!-- Error message display -->
      <div v-if="errorMessage" class="error-message">
        <span class="codicon codicon-error"></span>
        {{ errorMessage }}
      </div>

      <!-- Sentiment Feedback Section -->
      <section class="component-container">
        <h3>How was your experience?</h3>
        <section class="sentiment-button">
          <div class="sentiment-selector">
            <template v-for="sentiment in sentiments" :key="sentiment.id">
              <input
                :id="sentiment.id"
                :value="sentiment.value"
                type="radio"
                name="sentiment"
                :checked="selectedSentiment === sentiment.value"
                @change="selectSentiment(sentiment.value)"
              />
              <label
                class="sentiment"
                :class="sentiment.id"
                :for="sentiment.id"
                :title="sentiment.label"
              ></label>
            </template>
          </div>
        </section>
      </section>

      <section class="component-section">
        <p class="required">Tell us why?</p>
        <vscode-textarea
          maxlength="512"
          cols="29"
          resize="both"
          id="sentiment-comment"
          :value="sentimentComment"
          @input="sentimentComment = ($event.target as HTMLTextAreaElement).value"
        ></vscode-textarea>
      </section>

      <section class="component-section checkbox-section">
        <input
          type="checkbox"
          id="sentiment-data-sharing-checkbox"
          v-model="sentimentDataSharingAccepted"
        />
        <label for="sentiment-data-sharing-checkbox">
          I understand that feedback is shared with Red Hat and IBM.
        </label>
      </section>

      <section class="component-section">
        <vscode-button
          id="sentiment-submit"
          :disabled="!canSubmitSentiment"
          @click="submitSentiment"
        >
          {{ sentimentSubmitted ? "Sent!" : "Send" }}
        </vscode-button>
      </section>

      <vscode-divider></vscode-divider>

      <!-- Issue Feedback Section -->
      <section class="component-container">
        <h3>Tell us more</h3>
        <section class="component-section">
          <vscode-single-select
            id="issue-type-dropdown"
            class="issue-dropdown"
            :value="issueType"
            @change="issueType = ($event.target as HTMLSelectElement).value"
          >
            <vscode-option
              v-for="option in issueTypes"
              :key="option.value"
              :value="option.value"
              :selected="issueType === option.value"
            >
              {{ option.label }}
            </vscode-option>
          </vscode-single-select>
        </section>

        <!-- Bug Report / Feature Request Form -->
        <template v-if="issueType === 'bug-report' || issueType === 'feature-request'">
          <section class="component-section">
            <p class="required">Title</p>
            <vscode-textfield
              size="30"
              id="issue-title"
              placeholder="Enter a title."
              :value="issueTitle"
              @input="issueTitle = ($event.target as HTMLInputElement).value"
            />
          </section>
          <section class="component-section">
            <p class="required">
              {{ issueType === "bug-report" ? "Steps to reproduce" : "Description" }}
            </p>
            <vscode-textarea
              id="issue-description"
              cols="29"
              maxlength="4096"
              placeholder="Enter details."
              resize="both"
              :value="issueDescription"
              @input="issueDescription = ($event.target as HTMLTextAreaElement).value"
            />
          </section>
        </template>

        <!-- Suggestion Feedback Form -->
        <template v-if="issueType === 'suggestion-feedback'">
          <section class="component-section">
            <p class="required">Prompt</p>
            <vscode-textarea
              id="suggestion-prompt"
              cols="29"
              placeholder="The contents of the playbook until the name of the task used for a recommendation."
              resize="both"
              :value="suggestionPrompt"
              @input="suggestionPrompt = ($event.target as HTMLTextAreaElement).value"
            />
          </section>
          <section class="component-section">
            <p class="required">Provided Recommendation</p>
            <vscode-textarea
              id="suggestion-provided"
              cols="29"
              placeholder="The recommendation content provided by Ansible Lightspeed."
              resize="both"
              :value="suggestionProvided"
              @input="suggestionProvided = ($event.target as HTMLTextAreaElement).value"
            />
          </section>
          <section class="component-section">
            <p class="required">Expected Recommendation</p>
            <vscode-textarea
              id="suggestion-expected"
              cols="29"
              placeholder="The recommendation that you expected -- edit the response with what you expected the result to be."
              resize="both"
              :value="suggestionExpected"
              @input="suggestionExpected = ($event.target as HTMLTextAreaElement).value"
            />
          </section>
          <section class="component-section">
            <p class="required">Why was modification required?</p>
            <vscode-textarea
              id="suggestion-additional-comment"
              cols="29"
              placeholder="Enter details."
              resize="both"
              :value="suggestionAdditionalComment"
              @input="suggestionAdditionalComment = ($event.target as HTMLTextAreaElement).value"
            />
          </section>
        </template>

        <!-- Data sharing checkbox and submit for issues -->
        <template v-if="issueType !== 'select-issue-type'">
          <section class="component-section checkbox-section">
            <input
              type="checkbox"
              id="feedback-data-sharing-checkbox"
              v-model="feedbackDataSharingAccepted"
            />
            <label for="feedback-data-sharing-checkbox">
              I understand that feedback is shared with Red Hat and IBM.
            </label>
          </section>
          <section class="component-section">
            <vscode-button
              id="issue-submit-button"
              :disabled="!canSubmitIssue"
              @click="submitIssue"
            >
              {{ issueSubmitted ? "Submitted!" : "Submit" }}
            </vscode-button>
          </section>
        </template>
      </section>
    </form>
  </div>
</template>

<style scoped>
#feedback-container {
  padding: 1rem;
}

#feedback-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.component-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
}

.component-container > * {
  margin: 0.25rem 0;
}

.component-section {
  margin-bottom: 10px;
  width: auto;
}

.component-section > p {
  margin: 5px 0;
}

.checkbox-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sentiment-button {
  cursor: pointer;
  margin-bottom: 10px;
}

.sentiment-selector {
  display: flex;
  gap: 0.25rem;
}

.sentiment-selector input {
  margin: 0;
  padding: 0;
  position: absolute;
  left: -9999px;
}

.sentiment-selector input:active + .sentiment {
  opacity: 0.9;
}

.sentiment-selector input:checked + .sentiment {
  transform: scale(1.2);
  filter: drop-shadow(0 0 4px var(--vscode-focusBorder));
}

.sentiment {
  cursor: pointer;
  background-size: contain;
  background-repeat: no-repeat;
  display: inline-block;
  width: 32px;
  height: 32px;
  font-size: 24px;
}

.very-negative::after,
.negative::after,
.neutral::after,
.positive::after,
.very-positive::after {
  padding: 4px;
}

.very-negative::after {
  content: "\01F61E";
}
.negative::after {
  content: "\01F641";
}
.neutral::after {
  content: "\01F610";
}
.positive::after {
  content: "\01F642";
}
.very-positive::after {
  content: "\01F600";
}

.issue-dropdown {
  width: 200px;
}

.required:after {
  color: #e32;
  content: " *";
  display: inline;
}

.error-message {
  color: var(--vscode-errorForeground);
  background-color: var(--vscode-inputValidation-errorBackground);
  border: 1px solid var(--vscode-inputValidation-errorBorder);
  padding: 0.5rem;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

h3 {
  margin: 0.5rem 0;
}

vscode-divider {
  margin: 1rem 0;
}
</style>
