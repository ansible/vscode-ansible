import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StatusBoxPrompt from "../../../../../../webviews/lightspeed/src/components/lightspeed/StatusBoxPrompt.vue";

describe("StatusBoxPrompt", () => {
  it("renders the prompt text", () => {
    const wrapper = mount(StatusBoxPrompt, {
      props: {
        prompt: "Create a playbook to install nginx",
      },
    });
    expect(wrapper.text()).toContain("Create a playbook to install nginx");
  });

  it("renders prompt in a span with id", () => {
    const wrapper = mount(StatusBoxPrompt, {
      props: {
        prompt: "Test prompt",
      },
    });
    const promptSpan = wrapper.find("#prompt");
    expect(promptSpan.exists()).toBe(true);
    expect(promptSpan.text()).toBe("Test prompt");
  });

  it("wraps prompt in quotes", () => {
    const wrapper = mount(StatusBoxPrompt, {
      props: {
        prompt: "Test prompt",
      },
    });
    expect(wrapper.text()).toMatch(/"Test prompt"/);
  });

  it("renders Edit link", () => {
    const wrapper = mount(StatusBoxPrompt, {
      props: {
        prompt: "Test prompt",
      },
    });
    const editLink = wrapper.find("#backAnchorPrompt");
    expect(editLink.exists()).toBe(true);
    expect(editLink.text()).toBe("Edit");
  });

  it("emits restartWizard event when Edit is clicked", async () => {
    const wrapper = mount(StatusBoxPrompt, {
      props: {
        prompt: "Test prompt",
      },
    });
    const editLink = wrapper.find("#backAnchorPrompt");
    await editLink.trigger("click");

    expect(wrapper.emitted()).toHaveProperty("restartWizard");
    expect(wrapper.emitted("restartWizard")).toHaveLength(1);
  });

  it("handles long prompts", () => {
    const longPrompt =
      "This is a very long prompt that describes what the user wants to create with Ansible Lightspeed including many details about the infrastructure and configuration";
    const wrapper = mount(StatusBoxPrompt, {
      props: {
        prompt: longPrompt,
      },
    });
    expect(wrapper.text()).toContain(longPrompt);
  });

  it("handles special characters in prompt", () => {
    const specialPrompt = "Create playbook with <tags> & variables: $var";
    const wrapper = mount(StatusBoxPrompt, {
      props: {
        prompt: specialPrompt,
      },
    });
    expect(wrapper.find("#prompt").text()).toBe(specialPrompt);
  });
});
