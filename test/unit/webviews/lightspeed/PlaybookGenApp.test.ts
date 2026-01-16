import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import PlaybookGenApp from "../../../../webviews/lightspeed/src/PlaybookGenApp.vue";
import { vscodeApi } from "../../../../webviews/lightspeed/src/utils/vscode";

describe("PlaybookGenApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the main header", () => {
    const wrapper = mount(PlaybookGenApp);
    expect(wrapper.find("#main-header").text()).toBe(
      "Create a playbook with Ansible Lightspeed",
    );
  });

  it("shows page 1 of 3 initially", () => {
    const wrapper = mount(PlaybookGenApp);
    expect(wrapper.find("#page-number").text()).toBe("1 of 3");
  });

  it("registers message handlers on mount", () => {
    mount(PlaybookGenApp);
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "generatePlaybook",
      expect.any(Function),
    );
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "errorMessage",
      expect.any(Function),
    );
  });

  it("sends feedback event on open", async () => {
    mount(PlaybookGenApp);
    await flushPromises();
    expect(vscodeApi.post).toHaveBeenCalledWith("feedback", {
      request: expect.objectContaining({
        playbookGenerationAction: expect.objectContaining({
          action: expect.any(Number),
          fromPage: undefined,
          toPage: 1,
        }),
      }),
    });
  });

  describe("page 1 - prompt input", () => {
    it("renders the prompt field", () => {
      const wrapper = mount(PlaybookGenApp);
      expect(wrapper.findComponent({ name: "PromptField" }).exists()).toBe(
        true,
      );
    });

    it("renders the Analyze button disabled when prompt is empty", () => {
      const wrapper = mount(PlaybookGenApp);
      const button = wrapper.find("vscode-button");
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe("Analyze");
      expect(button.attributes("disabled")).toBeDefined();
    });

    it("renders the examples box", () => {
      const wrapper = mount(PlaybookGenApp);
      expect(wrapper.findComponent({ name: "PromptExampleBox" }).exists()).toBe(
        true,
      );
    });
  });

  describe("error handling", () => {
    it("displays error message when received", async () => {
      const wrapper = mount(PlaybookGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const errorHandler = onCalls.find(
        (call) => call[0] === "errorMessage",
      )?.[1];

      errorHandler?.("Generation failed");
      await flushPromises();

      expect(wrapper.findComponent({ name: "ErrorBox" }).exists()).toBe(true);
    });
  });

  describe("page transitions", () => {
    it("advances to page 2 when generatePlaybook response is received", async () => {
      const wrapper = mount(PlaybookGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generatePlaybook",
      )?.[1];

      generateHandler?.({
        playbook: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        outline: "1. Debug message",
      });
      await flushPromises();

      expect(wrapper.find("#page-number").text()).toBe("2 of 3");
    });

    it("shows outline review on page 2", async () => {
      const wrapper = mount(PlaybookGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generatePlaybook",
      )?.[1];

      generateHandler?.({
        playbook: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        outline: "1. Debug message",
      });
      await flushPromises();

      expect(wrapper.findComponent({ name: "OutlineReview" }).exists()).toBe(
        true,
      );
      expect(wrapper.findComponent({ name: "StatusBoxPrompt" }).exists()).toBe(
        true,
      );
    });

    it("shows Continue and Back buttons on page 2", async () => {
      const wrapper = mount(PlaybookGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generatePlaybook",
      )?.[1];

      generateHandler?.({
        playbook: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        outline: "1. Debug message",
      });
      await flushPromises();

      const buttons = wrapper.findAll("vscode-button");
      expect(buttons.some((b) => b.text() === "Continue")).toBe(true);
      expect(buttons.some((b) => b.text() === "Back")).toBe(true);
    });

    it("shows generated file on page 3", async () => {
      const wrapper = mount(PlaybookGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generatePlaybook",
      )?.[1];

      // Go to page 2
      generateHandler?.({
        playbook: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        outline: "1. Debug message",
      });
      await flushPromises();

      // Click Continue to go to page 3
      const continueButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Continue");
      await continueButton?.trigger("click");
      await flushPromises();

      expect(wrapper.find("#page-number").text()).toBe("3 of 3");
      expect(
        wrapper.findComponent({ name: "GeneratedFileEntry" }).exists(),
      ).toBe(true);
    });

    it("shows Open editor button on page 3", async () => {
      const wrapper = mount(PlaybookGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generatePlaybook",
      )?.[1];

      // Go to page 2
      generateHandler?.({
        playbook: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        outline: "1. Debug message",
      });
      await flushPromises();

      // Click Continue to go to page 3
      const continueButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Continue");
      await continueButton?.trigger("click");
      await flushPromises();

      const buttons = wrapper.findAll("vscode-button");
      expect(buttons.some((b) => b.text() === "Open editor")).toBe(true);
    });

    it("can navigate back from page 2 to page 1", async () => {
      const wrapper = mount(PlaybookGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generatePlaybook",
      )?.[1];

      generateHandler?.({
        playbook: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        outline: "1. Debug message",
      });
      await flushPromises();

      // Click Back button
      const backButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Back");
      await backButton?.trigger("click");
      await flushPromises();

      expect(wrapper.find("#page-number").text()).toBe("1 of 3");
    });
  });

  describe("warnings handling", () => {
    it("displays warnings from response in error box", async () => {
      const wrapper = mount(PlaybookGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generatePlaybook",
      )?.[1];

      generateHandler?.({
        playbook: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        outline: "1. Debug message",
        warnings: ["Warning 1", "Warning 2"],
      });
      await flushPromises();

      expect(wrapper.findComponent({ name: "ErrorBox" }).exists()).toBe(true);
    });
  });
});
