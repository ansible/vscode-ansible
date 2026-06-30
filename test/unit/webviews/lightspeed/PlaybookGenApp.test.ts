import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import PlaybookGenApp from "@webviews/lightspeed/src/PlaybookGenApp.vue";
import { vscodeApi } from "@webviews/lightspeed/src/utils/vscode";
import { WizardGenerationActionType } from "@src/definitions/lightspeed";

function getHandler(name: string) {
  return vi
    .mocked(vscodeApi.on)
    .mock.calls.find((call) => call[0] === name)?.[1];
}

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

      void errorHandler?.("Generation failed");
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

      void generateHandler?.({
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

      void generateHandler?.({
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

      void generateHandler?.({
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
      void generateHandler?.({
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
      void generateHandler?.({
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

      void generateHandler?.({
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

      void generateHandler?.({
        playbook: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        outline: "1. Debug message",
        warnings: ["Warning 1", "Warning 2"],
      });
      await flushPromises();

      expect(wrapper.findComponent({ name: "ErrorBox" }).exists()).toBe(true);
    });
  });

  describe("analyze action", () => {
    it("posts generatePlaybook and shows the spinner when prompt is filled", async () => {
      const wrapper = mount(PlaybookGenApp);

      const input = wrapper.find("input");
      await input.setValue("make a playbook");
      await flushPromises();

      const analyze = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Analyze");
      await analyze?.trigger("click");
      await flushPromises();

      expect(vscodeApi.post).toHaveBeenCalledWith("generatePlaybook", {
        text: "make a playbook",
        outline: "",
      });
      // loadingNewResponse becomes true -> spinner replaces page content.
      expect(wrapper.find(".progress-spinner").exists()).toBe(true);
    });
  });

  describe("generatePlaybook handler", () => {
    it("accepts array warnings (push branch) and advances to page 2", async () => {
      const wrapper = mount(PlaybookGenApp);

      // Exercises the Array.isArray(warnings) push branch. Note: the page
      // watcher resets errorMessages on transition, so the warning text is
      // not visible afterwards - we only verify the branch runs and advances.
      void getHandler("generatePlaybook")?.({
        playbook: "- hosts: all",
        outline: "1. step",
        warnings: ["w1"],
      });
      await flushPromises();

      expect(wrapper.find("#page-number").text()).toBe("2 of 3");
      expect(wrapper.findComponent({ name: "OutlineReview" }).exists()).toBe(
        true,
      );
      expect(wrapper.findComponent({ name: "StatusBoxPrompt" }).exists()).toBe(
        true,
      );
    });

    it("ignores non-array warnings but still advances", async () => {
      const wrapper = mount(PlaybookGenApp);

      void getHandler("generatePlaybook")?.({
        playbook: "- hosts: all",
        outline: "1. step",
        warnings: "not-an-array",
      });
      await flushPromises();

      expect(wrapper.find("#page-number").text()).toBe("2 of 3");
      expect(wrapper.text()).not.toContain("not-an-array");
    });
  });

  describe("nextPage with an existing response", () => {
    it("only increments the page without re-posting generatePlaybook", async () => {
      const wrapper = mount(PlaybookGenApp);

      void getHandler("generatePlaybook")?.({
        playbook: "- hosts: all",
        outline: "1. step",
      });
      await flushPromises();

      vi.mocked(vscodeApi.post).mockClear();
      const continueButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Continue");
      await continueButton?.trigger("click");
      await flushPromises();

      expect(wrapper.find("#page-number").text()).toBe("3 of 3");
      expect(vscodeApi.post).not.toHaveBeenCalledWith(
        "generatePlaybook",
        expect.anything(),
      );
    });
  });

  describe("openEditor", () => {
    it("opens the editor and sends a CLOSE_ACCEPT feedback event", async () => {
      const wrapper = mount(PlaybookGenApp);

      void getHandler("generatePlaybook")?.({
        playbook: "- hosts: all\n  tasks: []",
        outline: "1. step",
      });
      await flushPromises();

      const continueButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Continue");
      await continueButton?.trigger("click");
      await flushPromises();

      vi.mocked(vscodeApi.post).mockClear();
      const openButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Open editor");
      await openButton?.trigger("click");
      await flushPromises();

      expect(vscodeApi.post).toHaveBeenCalledWith("openEditor", {
        content: "- hosts: all\n  tasks: []",
      });
      expect(vscodeApi.post).toHaveBeenCalledWith("feedback", {
        request: expect.objectContaining({
          playbookGenerationAction: expect.objectContaining({
            action: WizardGenerationActionType.CLOSE_ACCEPT,
          }),
        }),
      });
    });

    it("is a no-op when the playbook content is falsy", async () => {
      const wrapper = mount(PlaybookGenApp);

      // Empty playbook -> response.value.playbook is falsy.
      void getHandler("generatePlaybook")?.({
        playbook: "",
        outline: "1. step",
      });
      await flushPromises();

      const continueButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Continue");
      await continueButton?.trigger("click");
      await flushPromises();

      vi.mocked(vscodeApi.post).mockClear();
      const openButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Open editor");
      await openButton?.trigger("click");
      await flushPromises();

      expect(vscodeApi.post).not.toHaveBeenCalledWith(
        "openEditor",
        expect.anything(),
      );
    });
  });

  describe("errorMessage handler", () => {
    it("stops loading and renders the error text", async () => {
      const wrapper = mount(PlaybookGenApp);

      void getHandler("errorMessage")?.("Boom failed");
      await flushPromises();

      expect(wrapper.find(".progress-spinner").exists()).toBe(false);
      expect(wrapper.text()).toContain("Boom failed");
    });
  });

  describe("watchers", () => {
    it("resets a previous response when the prompt changes, re-triggering generation", async () => {
      const wrapper = mount(PlaybookGenApp);

      // Receive a response (page 2, response defined).
      void getHandler("generatePlaybook")?.({
        playbook: "- hosts: all",
        outline: "1. step",
      });
      await flushPromises();

      // Go back to page 1 where the prompt field is editable.
      const backButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Back");
      await backButton?.trigger("click");
      await flushPromises();

      // Change the prompt -> watch(prompt) clears the response + outline.
      await wrapper.find("input").setValue("a brand new prompt");
      await flushPromises();

      vi.mocked(vscodeApi.post).mockClear();
      const analyze = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Analyze");
      await analyze?.trigger("click");
      await flushPromises();

      // Because response was cleared, nextPage posts a fresh generation
      // with the outline reset to "".
      expect(vscodeApi.post).toHaveBeenCalledWith("generatePlaybook", {
        text: "a brand new prompt",
        outline: "",
      });
    });

    it("clears the response when the outline diverges from the response outline", async () => {
      const wrapper = mount(PlaybookGenApp);

      void getHandler("generatePlaybook")?.({
        playbook: "- hosts: all",
        outline: "original outline",
      });
      await flushPromises();

      // Edit the outline to something different -> watch(outline) clears response.
      await wrapper
        .findComponent({ name: "OutlineReview" })
        .vm.$emit("outlineUpdate", "a different outline");
      await flushPromises();

      vi.mocked(vscodeApi.post).mockClear();
      const continueButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Continue");
      await continueButton?.trigger("click");
      await flushPromises();

      // response was cleared, so Continue triggers a fresh generation.
      expect(vscodeApi.post).toHaveBeenCalledWith("generatePlaybook", {
        text: "",
        outline: "a different outline",
      });
    });
  });
});
