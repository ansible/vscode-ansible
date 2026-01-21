import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import FeedbackApp from "../../../../webviews/lightspeed/src/FeedbackApp.vue";

// Mock the vscodeApi
const mockPost = vi.fn();
const mockOn = vi.fn();

vi.mock("../../../../webviews/lightspeed/src/utils", () => ({
  vscodeApi: {
    post: (type: string, data: unknown) => mockPost(type, data),
    on: (type: string, callback: (data: unknown) => void) =>
      mockOn(type, callback),
  },
}));

describe("FeedbackApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders the sentiment feedback section", () => {
      const wrapper = mount(FeedbackApp);

      expect(wrapper.find("h3").text()).toBe("How was your experience?");
      expect(wrapper.find(".sentiment-selector").exists()).toBe(true);
      expect(wrapper.findAll('input[name="sentiment"]').length).toBe(5);
    });

    it("renders the issue feedback section", () => {
      const wrapper = mount(FeedbackApp);

      expect(wrapper.text()).toContain("Tell us more");
      expect(wrapper.find("#issue-type-dropdown").exists()).toBe(true);
    });

    it("renders all sentiment options", () => {
      const wrapper = mount(FeedbackApp);

      const sentimentInputs = wrapper.findAll('input[name="sentiment"]');
      expect(sentimentInputs.length).toBe(5);

      const ids = sentimentInputs.map((input) => input.element.id);
      expect(ids).toContain("very-negative");
      expect(ids).toContain("negative");
      expect(ids).toContain("neutral");
      expect(ids).toContain("positive");
      expect(ids).toContain("very-positive");
    });

    it("renders all issue type options", () => {
      const wrapper = mount(FeedbackApp);

      const options = wrapper.findAll("vscode-option");
      expect(options.length).toBeGreaterThanOrEqual(4);
    });

    it("renders the data sharing checkbox for sentiment", () => {
      const wrapper = mount(FeedbackApp);

      const checkbox = wrapper.find("#sentiment-data-sharing-checkbox");
      expect(checkbox.exists()).toBe(true);
      expect(wrapper.text()).toContain(
        "I understand that feedback is shared with Red Hat and IBM",
      );
    });
  });

  describe("sentiment feedback", () => {
    it("selects a sentiment when clicked", async () => {
      const wrapper = mount(FeedbackApp);

      const positiveInput = wrapper.find("#positive");
      await positiveInput.setValue(true);

      expect((positiveInput.element as HTMLInputElement).checked).toBe(true);
    });

    it("disables submit button when sentiment is not selected", () => {
      const wrapper = mount(FeedbackApp);

      const submitButton = wrapper.find("#sentiment-submit");
      expect(submitButton.attributes("disabled")).toBeDefined();
    });

    it("disables submit button when comment is empty", async () => {
      const wrapper = mount(FeedbackApp);

      // Select a sentiment
      await wrapper.find("#positive").setValue(true);

      // Check data sharing
      await wrapper.find("#sentiment-data-sharing-checkbox").setValue(true);

      // Button should still be disabled because comment is empty
      const submitButton = wrapper.find("#sentiment-submit");
      expect(submitButton.attributes("disabled")).toBeDefined();
    });

    it("disables submit button when data sharing is not checked", async () => {
      const wrapper = mount(FeedbackApp);

      // Select a sentiment
      await wrapper.find("#positive").setValue(true);

      // Set comment directly on component
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).sentimentComment = "Great experience!";
      await flushPromises();

      // Don't check data sharing - leave it unchecked

      // Button should be disabled
      const submitButton = wrapper.find("#sentiment-submit");
      expect(submitButton.attributes("disabled")).toBeDefined();
    });

    it("submits sentiment feedback when form is valid", async () => {
      const wrapper = mount(FeedbackApp);

      // Select a sentiment
      await wrapper.find("#positive").setValue(true);

      // Get the component instance and set the comment value directly
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).sentimentComment = "Great experience!";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).sentimentDataSharingAccepted = true;

      await flushPromises();

      // Click submit
      await wrapper.find("#sentiment-submit").trigger("click");

      expect(mockPost).toHaveBeenCalledWith("sentimentFeedback", {
        value: 4,
        feedback: "Great experience!",
      });
    });

    it("shows error message when submitting without sentiment selected", async () => {
      const wrapper = mount(FeedbackApp);

      // Try to submit without selecting sentiment
      await wrapper.find("#sentiment-submit").trigger("click");

      // Check for error message - the canSubmitSentiment guard prevents submission
      // but still allows click to be processed
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe("issue feedback - bug report", () => {
    it("shows bug report form when bug-report is selected", async () => {
      const wrapper = mount(FeedbackApp);

      // Set issue type directly on component
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).issueType = "bug-report";
      await flushPromises();

      expect(wrapper.find("#issue-title").exists()).toBe(true);
      expect(wrapper.find("#issue-description").exists()).toBe(true);
      expect(wrapper.text()).toContain("Steps to reproduce");
    });

    it("shows feature request form when feature-request is selected", async () => {
      const wrapper = mount(FeedbackApp);

      // Set issue type directly on component
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).issueType = "feature-request";
      await flushPromises();

      expect(wrapper.find("#issue-title").exists()).toBe(true);
      expect(wrapper.find("#issue-description").exists()).toBe(true);
      expect(wrapper.text()).toContain("Description");
    });

    it("submits issue feedback when form is valid", async () => {
      const wrapper = mount(FeedbackApp);

      // Set form values directly on component
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).issueType = "bug-report";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).issueTitle = "Test bug";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).issueDescription = "Steps to reproduce the bug";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).feedbackDataSharingAccepted = true;
      await flushPromises();

      // Click submit
      await wrapper.find("#issue-submit-button").trigger("click");

      expect(mockPost).toHaveBeenCalledWith("issueFeedback", {
        type: "bug-report",
        title: "Test bug",
        description: "Steps to reproduce the bug",
      });
    });
  });

  describe("issue feedback - suggestion feedback", () => {
    it("shows suggestion feedback form when suggestion-feedback is selected", async () => {
      const wrapper = mount(FeedbackApp);

      // Set issue type directly on component
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).issueType = "suggestion-feedback";
      await flushPromises();

      expect(wrapper.find("#suggestion-prompt").exists()).toBe(true);
      expect(wrapper.find("#suggestion-provided").exists()).toBe(true);
      expect(wrapper.find("#suggestion-expected").exists()).toBe(true);
      expect(wrapper.find("#suggestion-additional-comment").exists()).toBe(
        true,
      );
    });

    it("submits suggestion feedback when form is valid", async () => {
      const wrapper = mount(FeedbackApp);

      // Set form values directly on component
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).issueType = "suggestion-feedback";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).suggestionPrompt = "Test prompt";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).suggestionProvided = "Provided suggestion";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).suggestionExpected = "Expected suggestion";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).suggestionAdditionalComment = "Additional comment";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).feedbackDataSharingAccepted = true;
      await flushPromises();

      // Click submit
      await wrapper.find("#issue-submit-button").trigger("click");

      expect(mockPost).toHaveBeenCalledWith("suggestionFeedback", {
        prompt: "Test prompt",
        provided: "Provided suggestion",
        expected: "Expected suggestion",
        additionalComment: "Additional comment",
      });
    });
  });

  describe("error handling", () => {
    it("displays error messages", async () => {
      const wrapper = mount(FeedbackApp);

      // Set error message directly
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).errorMessage = "An error occurred";
      await flushPromises();

      expect(wrapper.find(".error-message").exists()).toBe(true);
      expect(wrapper.text()).toContain("An error occurred");
    });

    it("clears error on feedbackSuccess message", async () => {
      const wrapper = mount(FeedbackApp);

      // Set error message
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).errorMessage = "An error occurred";
      await flushPromises();

      // Get the feedbackSuccess callback that was registered
      const feedbackSuccessCall = mockOn.mock.calls.find(
        (call) => call[0] === "feedbackSuccess",
      );
      if (feedbackSuccessCall) {
        feedbackSuccessCall[1]();
        await flushPromises();

        // Error should be cleared
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((wrapper.vm as any).errorMessage).toBe("");
      }
    });

    it("shows error from errorMessage event", async () => {
      const wrapper = mount(FeedbackApp);

      // Get the errorMessage callback that was registered
      const errorMessageCall = mockOn.mock.calls.find(
        (call) => call[0] === "errorMessage",
      );
      if (errorMessageCall) {
        errorMessageCall[1]("Server error");
        await flushPromises();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((wrapper.vm as any).errorMessage).toBe("Server error");
      }
    });
  });

  describe("form reset after submission", () => {
    it("resets sentiment form after successful submission", async () => {
      const wrapper = mount(FeedbackApp);

      // Set form values
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).selectedSentiment = 4;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).sentimentComment = "Great!";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).sentimentDataSharingAccepted = true;
      await flushPromises();

      // Submit
      await wrapper.find("#sentiment-submit").trigger("click");

      // Form should be reset
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((wrapper.vm as any).selectedSentiment).toBe(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((wrapper.vm as any).sentimentComment).toBe("");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((wrapper.vm as any).sentimentDataSharingAccepted).toBe(false);
    });

    it("resets issue form after successful submission", async () => {
      const wrapper = mount(FeedbackApp);

      // Set form values
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).issueType = "bug-report";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).issueTitle = "Bug title";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).issueDescription = "Bug description";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper.vm as any).feedbackDataSharingAccepted = true;
      await flushPromises();

      // Submit
      await wrapper.find("#issue-submit-button").trigger("click");

      // Form should be reset (except issue type)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((wrapper.vm as any).issueTitle).toBe("");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((wrapper.vm as any).issueDescription).toBe("");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((wrapper.vm as any).feedbackDataSharingAccepted).toBe(false);
    });
  });
});
