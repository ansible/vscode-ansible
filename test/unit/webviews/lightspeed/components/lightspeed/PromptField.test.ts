import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import PromptField from "../../../../../../webviews/lightspeed/src/components/lightspeed/PromptField.vue";
import { vscodeApi } from "../../../../../../webviews/lightspeed/src/utils/vscode";

describe("PromptField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the prompt container", () => {
    const wrapper = mount(PromptField, {
      props: {
        prompt: "",
      },
    });
    expect(wrapper.find(".promptContainer").exists()).toBe(true);
  });

  it("displays the label text", () => {
    const wrapper = mount(PromptField, {
      props: {
        prompt: "",
      },
    });
    expect(wrapper.text()).toContain(
      "Describe what you want to achieve in natural language",
    );
  });

  it("renders the AutoComplete component", () => {
    const wrapper = mount(PromptField, {
      props: {
        prompt: "",
      },
    });
    expect(wrapper.findComponent({ name: "AutoComplete" }).exists()).toBe(true);
  });

  it("requests recent prompts on mount", async () => {
    mount(PromptField, {
      props: {
        prompt: "",
      },
    });
    await flushPromises();
    expect(vscodeApi.post).toHaveBeenCalledWith("getRecentPrompts", {});
  });

  it("registers getRecentPrompts handler on mount", () => {
    mount(PromptField, {
      props: {
        prompt: "",
      },
    });
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "getRecentPrompts",
      expect.any(Function),
    );
  });

  it("passes placeholder to AutoComplete", () => {
    const wrapper = mount(PromptField, {
      props: {
        prompt: "",
        placeholder: "Enter your prompt here...",
      },
    });
    const autocomplete = wrapper.findComponent({ name: "AutoComplete" });
    expect(autocomplete.props("placeholder")).toBe("Enter your prompt here...");
  });

  it("emits update:prompt when input changes", async () => {
    const wrapper = mount(PromptField, {
      props: {
        prompt: "",
        "onUpdate:prompt": (e: string) => wrapper.setProps({ prompt: e }),
      },
    });

    const input = wrapper.find("input");
    await input.setValue("New prompt value");
    await flushPromises();

    expect(wrapper.emitted("update:prompt")).toBeTruthy();
  });

  it("displays current prompt value", () => {
    const wrapper = mount(PromptField, {
      props: {
        prompt: "Current prompt text",
      },
    });
    const input = wrapper.find("input");
    expect((input.element as HTMLInputElement).value).toBe(
      "Current prompt text",
    );
  });
});
