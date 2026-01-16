import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import FeedbackBox from "../../../../../../webviews/lightspeed/src/components/lightspeed/FeedbackBox.vue";
import { vscodeApi } from "../../../../../../webviews/lightspeed/src/utils/vscode";

describe("FeedbackBox", () => {
  const defaultProps = {
    explanationId: "test-explanation-id",
    explanationType: "playbook" as const,
    telemetryEnabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the feedback container", () => {
    const wrapper = mount(FeedbackBox, { props: defaultProps });
    expect(wrapper.find(".feedbackContainer").exists()).toBe(true);
  });

  it("renders thumbs up button", () => {
    const wrapper = mount(FeedbackBox, { props: defaultProps });
    expect(wrapper.find("#thumbsup-button").exists()).toBe(true);
    expect(wrapper.find(".codicon-thumbsup").exists()).toBe(true);
  });

  it("renders thumbs down button", () => {
    const wrapper = mount(FeedbackBox, { props: defaultProps });
    expect(wrapper.find("#thumbsdown-button").exists()).toBe(true);
    expect(wrapper.find(".codicon-thumbsdown").exists()).toBe(true);
  });

  describe("when telemetry is enabled", () => {
    it("buttons are not disabled", () => {
      const wrapper = mount(FeedbackBox, { props: defaultProps });
      const thumbsUpButton = wrapper.find("#thumbsup-button");
      const thumbsDownButton = wrapper.find("#thumbsdown-button");

      // Check that disabled attribute is not present or is false
      const upDisabled = thumbsUpButton.attributes("disabled");
      const downDisabled = thumbsDownButton.attributes("disabled");

      expect(upDisabled === undefined || upDisabled === "false").toBeTruthy();
      expect(
        downDisabled === undefined || downDisabled === "false",
      ).toBeTruthy();
    });

    it("sends thumbs up feedback when clicked", async () => {
      const wrapper = mount(FeedbackBox, { props: defaultProps });
      const thumbsUpButton = wrapper.find("#thumbsup-button");

      await thumbsUpButton.trigger("click");
      await flushPromises();

      expect(vscodeApi.post).toHaveBeenCalledWith("explanationThumbsUp", {
        action: expect.any(Number),
        explanationId: "test-explanation-id",
        explanationType: "playbook",
      });
    });

    it("sends thumbs down feedback when clicked", async () => {
      const wrapper = mount(FeedbackBox, { props: defaultProps });
      const thumbsDownButton = wrapper.find("#thumbsdown-button");

      await thumbsDownButton.trigger("click");
      await flushPromises();

      expect(vscodeApi.post).toHaveBeenCalledWith("explanationThumbsDown", {
        action: expect.any(Number),
        explanationId: "test-explanation-id",
        explanationType: "playbook",
      });
    });

    it("disables buttons after thumbs up is clicked", async () => {
      const wrapper = mount(FeedbackBox, { props: defaultProps });
      const thumbsUpButton = wrapper.find("#thumbsup-button");

      await thumbsUpButton.trigger("click");
      await flushPromises();

      expect(thumbsUpButton.attributes("disabled")).toBeDefined();
    });

    it("disables buttons after thumbs down is clicked", async () => {
      const wrapper = mount(FeedbackBox, { props: defaultProps });
      const thumbsDownButton = wrapper.find("#thumbsdown-button");

      await thumbsDownButton.trigger("click");
      await flushPromises();

      expect(thumbsDownButton.attributes("disabled")).toBeDefined();
    });

    it("applies selected class to thumbs up button after click", async () => {
      const wrapper = mount(FeedbackBox, { props: defaultProps });
      const thumbsUpButton = wrapper.find("#thumbsup-button");

      await thumbsUpButton.trigger("click");
      await flushPromises();

      expect(thumbsUpButton.classes()).toContain("iconButtonSelected");
    });

    it("applies selected class to thumbs down button after click", async () => {
      const wrapper = mount(FeedbackBox, { props: defaultProps });
      const thumbsDownButton = wrapper.find("#thumbsdown-button");

      await thumbsDownButton.trigger("click");
      await flushPromises();

      expect(thumbsDownButton.classes()).toContain("iconButtonSelected");
    });
  });

  describe("when telemetry is disabled", () => {
    const disabledProps = {
      ...defaultProps,
      telemetryEnabled: false,
    };

    it("buttons are disabled", () => {
      const wrapper = mount(FeedbackBox, { props: disabledProps });
      const thumbsUpButton = wrapper.find("#thumbsup-button");
      const thumbsDownButton = wrapper.find("#thumbsdown-button");

      expect(thumbsUpButton.attributes("disabled")).toBeDefined();
      expect(thumbsDownButton.attributes("disabled")).toBeDefined();
    });

    it("does not send feedback when buttons are clicked", async () => {
      const wrapper = mount(FeedbackBox, { props: disabledProps });
      const thumbsUpButton = wrapper.find("#thumbsup-button");

      await thumbsUpButton.trigger("click");
      await flushPromises();

      expect(vscodeApi.post).not.toHaveBeenCalled();
    });

    it("shows tooltip about telemetry requirement", () => {
      const wrapper = mount(FeedbackBox, { props: disabledProps });
      const tooltip = wrapper.find(".tooltip");

      expect(tooltip.exists()).toBe(true);
      expect(tooltip.text()).toContain("Feedback requires telemetry");
    });

    it("applies disabled class to container", () => {
      const wrapper = mount(FeedbackBox, { props: disabledProps });
      expect(wrapper.find(".feedbackContainer.disabled").exists()).toBe(true);
    });
  });

  describe("role explanation type", () => {
    it("sends role type in feedback request", async () => {
      const wrapper = mount(FeedbackBox, {
        props: {
          ...defaultProps,
          explanationType: "role" as const,
        },
      });
      const thumbsUpButton = wrapper.find("#thumbsup-button");

      await thumbsUpButton.trigger("click");
      await flushPromises();

      expect(vscodeApi.post).toHaveBeenCalledWith("explanationThumbsUp", {
        action: expect.any(Number),
        explanationId: "test-explanation-id",
        explanationType: "role",
      });
    });
  });
});
