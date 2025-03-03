import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import ErrorBox from "../../../../webviews/lightspeed/src/components/ErrorBox.vue";
import ErrorBoxEntry from "../../../../webviews/lightspeed/src/components/ErrorBoxEntry.vue";

describe("ErrorBox.vue", () => {
  it("renders error messages when they are passed", () => {
    const errorMessages = ["Error 1", "Error 2"];
    const wrapper = mount(ErrorBox, {
      props: { errorMessages },
    });

    const entries = wrapper.findAllComponents(ErrorBoxEntry);
    expect(entries).toHaveLength(errorMessages.length);
    entries.forEach((entry, index) => {
      expect(entry.props("message")).toBe(errorMessages[index]);
    });
  });

  it("does not render when there are no error messages", () => {
    const wrapper = mount(ErrorBox, {
      props: { errorMessages: [] },
    });

    expect(wrapper.find("#errorContainer").exists()).toBe(false);
  });
});
