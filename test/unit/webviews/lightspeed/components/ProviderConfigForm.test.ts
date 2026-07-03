import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ProviderConfigForm from "@webviews/lightspeed/src/components/ProviderConfigForm.vue";
import type { ProviderInfo } from "@webviews/lightspeed/src/components/llmProviderState";

function makeProvider(): ProviderInfo {
  return {
    type: "wca",
    name: "wca",
    displayName: "WCA",
    description: "",
    defaultEndpoint: "",
    configSchema: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "",
        description: "Your secret API key",
      },
      {
        key: "apiEndpoint",
        label: "Endpoint",
        type: "text",
        required: false,
        placeholder: "https://...",
        description: "",
      },
    ],
  };
}

function mountForm(hasChanges = false) {
  return mount(ProviderConfigForm, {
    props: {
      provider: makeProvider(),
      getConfigValue: (_t: string, key: string) =>
        key === "apiKey" ? "secret" : "endpoint",
      hasChanges,
    },
  });
}

describe("ProviderConfigForm", () => {
  it("renders one .config-field per configSchema entry", () => {
    const wrapper = mountForm();
    expect(wrapper.findAll(".config-field")).toHaveLength(2);
  });

  it("renders a required indicator only for required fields", () => {
    const wrapper = mountForm();
    expect(wrapper.findAll(".required-indicator")).toHaveLength(1);
  });

  it("renders a field description when present", () => {
    const wrapper = mountForm();
    const descriptions = wrapper.findAll(".field-description");
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0].text()).toContain("Your secret API key");
  });

  it("renders password fields with type=password", () => {
    const wrapper = mountForm();
    const apiKeyInput = wrapper.find("#apiKey-wca");
    expect(apiKeyInput.attributes("type")).toBe("password");
    const endpointInput = wrapper.find("#apiEndpoint-wca");
    expect(endpointInput.attributes("type")).toBe("text");
  });

  it("emits update:field with key and value on input", async () => {
    const wrapper = mountForm();
    const endpointInput = wrapper.find("#apiEndpoint-wca");
    await endpointInput.setValue("https://example.com");
    const emitted = wrapper.emitted("update:field");
    expect(emitted).toBeTruthy();
    expect(emitted?.[0]).toEqual(["apiEndpoint", "https://example.com"]);
  });

  it("emits save and cancel on the respective buttons", async () => {
    const wrapper = mountForm();
    await wrapper.find(".save-btn").trigger("click");
    await wrapper.find(".cancel-btn").trigger("click");
    expect(wrapper.emitted("save")).toBeTruthy();
    expect(wrapper.emitted("cancel")).toBeTruthy();
  });

  it("shows has-changes and unsaved indicator when hasChanges is true", () => {
    const wrapper = mountForm(true);
    expect(wrapper.find(".save-btn").classes()).toContain("has-changes");
    expect(wrapper.find(".unsaved-indicator").exists()).toBe(true);
  });

  it("hides the unsaved indicator when hasChanges is false", () => {
    const wrapper = mountForm(false);
    expect(wrapper.find(".save-btn").classes()).not.toContain("has-changes");
    expect(wrapper.find(".unsaved-indicator").exists()).toBe(false);
  });
});
