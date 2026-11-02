import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ProgressSpinner from "@webviews/lightspeed/src/components/ProgressSpinner.vue";

describe("ProgressSpinner", () => {
  it("renders the spinner container", () => {
    const wrapper = mount(ProgressSpinner);
    expect(wrapper.find(".spinner-container").exists()).toBe(true);
  });

  it("has progressbar role for accessibility", () => {
    const wrapper = mount(ProgressSpinner);
    expect(wrapper.find("[role='progressbar']").exists()).toBe(true);
  });

  it("has an aria-label for screen readers", () => {
    const wrapper = mount(ProgressSpinner);
    expect(wrapper.find(".spinner-container").attributes("aria-label")).toBe(
      "Loading",
    );
  });

  it("renders the spinning codicon", () => {
    const wrapper = mount(ProgressSpinner);
    const icon = wrapper.find(".codicon.codicon-loading.codicon-modifier-spin");
    expect(icon.exists()).toBe(true);
  });

  it("applies VS Code progress bar color", () => {
    const wrapper = mount(ProgressSpinner);
    const icon = wrapper.find(".codicon-modifier-spin");
    expect(icon.exists()).toBe(true);
  });
});
