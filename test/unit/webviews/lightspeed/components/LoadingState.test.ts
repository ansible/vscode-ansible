import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LoadingState from "../../../../../webviews/lightspeed/src/components/LoadingState.vue";

describe("LoadingState", () => {
  it("renders default loading message", () => {
    const wrapper = mount(LoadingState);
    expect(wrapper.text()).toBe("Loading...");
  });

  it("renders custom loading message when provided", () => {
    const wrapper = mount(LoadingState, {
      props: {
        message: "Please wait...",
      },
    });
    expect(wrapper.text()).toBe("Please wait...");
  });

  it("has correct CSS class", () => {
    const wrapper = mount(LoadingState);
    expect(wrapper.find(".loading").exists()).toBe(true);
  });
});
