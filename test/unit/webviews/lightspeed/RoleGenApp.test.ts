import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import RoleGenApp from "@webviews/lightspeed/src/RoleGenApp.vue";
import { vscodeApi } from "@webviews/lightspeed/src/utils/vscode";
import { WizardGenerationActionType } from "@src/definitions/lightspeed";

function getHandler(name: string) {
  return vi
    .mocked(vscodeApi.on)
    .mock.calls.find((call) => call[0] === name)?.[1];
}

const sampleResponse = {
  name: "my_role",
  files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
  outline: "1. step",
};

// Drive RoleGenApp to page 3 with a generated response.
async function goToPage3(wrapper: ReturnType<typeof mount>) {
  void getHandler("generateRole")?.(sampleResponse);
  await flushPromises();
  const continueButton = wrapper
    .findAll("vscode-button")
    .find((b) => b.text() === "Continue");
  await continueButton?.trigger("click");
  await flushPromises();
}

describe("RoleGenApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the main header", () => {
    const wrapper = mount(RoleGenApp);
    expect(wrapper.find("#main-header").text()).toBe(
      "Create a role with Ansible Lightspeed",
    );
  });

  it("shows page 1 of 3 initially", () => {
    const wrapper = mount(RoleGenApp);
    expect(wrapper.find("#page-number").text()).toBe("1 of 3");
  });

  it("registers message handlers on mount", () => {
    mount(RoleGenApp);
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "generateRole",
      expect.any(Function),
    );
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "errorMessage",
      expect.any(Function),
    );
  });

  it("sends feedback event on open", async () => {
    mount(RoleGenApp);
    await flushPromises();
    expect(vscodeApi.post).toHaveBeenCalledWith("feedback", {
      request: expect.objectContaining({
        roleGenerationAction: expect.objectContaining({
          action: expect.any(Number),
          fromPage: undefined,
          toPage: 1,
        }),
      }),
    });
  });

  it("contains learn more link to roles documentation", () => {
    const wrapper = mount(RoleGenApp);
    const link = wrapper.find("a");
    expect(link.exists()).toBe(true);
    expect(link.text()).toContain("Learn more about roles");
    expect(link.attributes("href")).toContain("playbooks_reuse_roles.html");
  });

  describe("page 1 - prompt input", () => {
    it("renders the prompt field", () => {
      const wrapper = mount(RoleGenApp);
      expect(wrapper.findComponent({ name: "PromptField" }).exists()).toBe(
        true,
      );
    });

    it("renders the Analyze button disabled when prompt is empty", () => {
      const wrapper = mount(RoleGenApp);
      const button = wrapper.find("vscode-button");
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe("Analyze");
      expect(button.attributes("disabled")).toBeDefined();
    });

    it("renders the examples box", () => {
      const wrapper = mount(RoleGenApp);
      expect(wrapper.findComponent({ name: "PromptExampleBox" }).exists()).toBe(
        true,
      );
    });
  });

  describe("error handling", () => {
    it("displays error message when received", async () => {
      const wrapper = mount(RoleGenApp);

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
    it("advances to page 2 when generateRole response is received", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      void generateHandler?.({
        name: "my_role",
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        outline: "1. Debug message",
      });
      await flushPromises();

      expect(wrapper.find("#page-number").text()).toBe("2 of 3");
    });

    it("shows role name input and outline review on page 2", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      void generateHandler?.({
        name: "my_role",
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        outline: "1. Debug message",
      });
      await flushPromises();

      expect(wrapper.text()).toContain("Role name:");
      expect(wrapper.findComponent({ name: "OutlineReview" }).exists()).toBe(
        true,
      );
      expect(wrapper.findComponent({ name: "StatusBoxPrompt" }).exists()).toBe(
        true,
      );
    });

    it("shows Continue and Back buttons on page 2", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      void generateHandler?.({
        name: "my_role",
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        outline: "1. Debug message",
      });
      await flushPromises();

      const buttons = wrapper.findAll("vscode-button");
      expect(buttons.some((b) => b.text() === "Continue")).toBe(true);
      expect(buttons.some((b) => b.text() === "Back")).toBe(true);
    });

    it("shows generated files and collection selector on page 3", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      // Go to page 2
      void generateHandler?.({
        name: "my_role",
        files: [
          { path: "tasks/main.yml", content: "- debug: msg=hello" },
          { path: "defaults/main.yml", content: "my_var: value" },
        ],
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
        wrapper.findAllComponents({ name: "GeneratedFileEntry" }).length,
      ).toBe(2);
      expect(
        wrapper.findComponent({ name: "CollectionSelector" }).exists(),
      ).toBe(true);
    });

    it("shows Save files button on page 3", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      // Go to page 2
      void generateHandler?.({
        name: "my_role",
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
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
      expect(buttons.some((b) => b.text() === "Save files")).toBe(true);
    });

    it("can navigate back from page 2 to page 1", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      void generateHandler?.({
        name: "my_role",
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
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

    it("can navigate back from page 3 to page 2", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      // Go to page 2
      void generateHandler?.({
        name: "my_role",
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        outline: "1. Debug message",
      });
      await flushPromises();

      // Click Continue to go to page 3
      const continueButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Continue");
      await continueButton?.trigger("click");
      await flushPromises();

      // Click Back to go to page 2
      const backButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Back");
      await backButton?.trigger("click");
      await flushPromises();

      expect(wrapper.find("#page-number").text()).toBe("2 of 3");
    });
  });

  describe("warnings handling", () => {
    it("displays warnings from response in error box", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      void generateHandler?.({
        name: "my_role",
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        outline: "1. Debug message",
        warnings: ["Warning 1", "Warning 2"],
      });
      await flushPromises();

      expect(wrapper.findComponent({ name: "ErrorBox" }).exists()).toBe(true);
    });
  });

  describe("analyze action", () => {
    it("posts generateRole and shows the spinner when prompt is filled", async () => {
      const wrapper = mount(RoleGenApp);

      await wrapper.find("input").setValue("make a role");
      await flushPromises();

      const analyze = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Analyze");
      await analyze?.trigger("click");
      await flushPromises();

      expect(vscodeApi.post).toHaveBeenCalledWith("generateRole", {
        name: "",
        text: "make a role",
        outline: "",
      });
      expect(wrapper.find(".progress-spinner").exists()).toBe(true);
    });
  });

  describe("generateRole handler", () => {
    it("populates the role name field on page 2 and stops loading", async () => {
      const wrapper = mount(RoleGenApp);

      void getHandler("generateRole")?.(sampleResponse);
      await flushPromises();

      expect(wrapper.find(".progress-spinner").exists()).toBe(false);
      // page 2 role-name textfield (a vscode-textfield custom element) reflects
      // the response name via its v-model bound value property.
      const field = wrapper.find("vscode-textfield");
      expect((field.element as HTMLInputElement).value).toBe("my_role");
      expect(wrapper.findComponent({ name: "OutlineReview" }).exists()).toBe(
        true,
      );
    });

    it("clears the response when the role name is edited (watch fires)", async () => {
      const wrapper = mount(RoleGenApp);

      void getHandler("generateRole")?.(sampleResponse);
      await flushPromises();

      // Editing the role name to a different value clears the response.
      const field = wrapper.find("vscode-textfield");
      (field.element as HTMLInputElement).value = "renamed_role";
      await field.trigger("input");
      await flushPromises();

      vi.mocked(vscodeApi.post).mockClear();
      const continueButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Continue");
      await continueButton?.trigger("click");
      await flushPromises();

      // response cleared -> Continue posts a fresh generation with the new name.
      expect(vscodeApi.post).toHaveBeenCalledWith("generateRole", {
        name: "renamed_role",
        text: "",
        outline: "1. step",
      });
    });
  });

  describe("page 3 - files and saving", () => {
    it("renders one GeneratedFileEntry per file and disables Save with no collection", async () => {
      const wrapper = mount(RoleGenApp);
      void getHandler("generateRole")?.({
        ...sampleResponse,
        files: [
          { path: "tasks/main.yml", content: "a" },
          { path: "defaults/main.yml", content: "b" },
        ],
      });
      await flushPromises();
      const continueButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Continue");
      await continueButton?.trigger("click");
      await flushPromises();

      expect(
        wrapper.findAllComponents({ name: "GeneratedFileEntry" }).length,
      ).toBe(2);
      expect(
        wrapper.findComponent({ name: "CollectionSelector" }).exists(),
      ).toBe(true);

      const saveButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Save files");
      expect(saveButton?.attributes("disabled")).toBeDefined();
    });

    it("saves files, sends CLOSE_ACCEPT feedback and shows SavedFiles", async () => {
      const wrapper = mount(RoleGenApp);
      await goToPage3(wrapper);

      // Populate the collection list so the AutoComplete renders, then choose
      // one. The mock AutoComplete forwards its id to a real <input>.
      void getHandler("getCollectionList")?.([
        { fqcn: "namespace.collection" },
      ]);
      await flushPromises();
      await wrapper.find("input").setValue("namespace.collection");
      await flushPromises();

      vi.mocked(vscodeApi.post).mockClear();
      const saveButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Save files");
      // disabled reflects as the string "false" on the custom element once a
      // collection is selected (i.e. the button is enabled).
      expect(saveButton?.attributes("disabled")).toBe("false");
      await saveButton?.trigger("click");
      await flushPromises();

      expect(vscodeApi.post).toHaveBeenCalledWith("feedback", {
        request: expect.objectContaining({
          roleGenerationAction: expect.objectContaining({
            action: WizardGenerationActionType.CLOSE_ACCEPT,
          }),
        }),
      });
      expect(wrapper.findComponent({ name: "SavedFiles" }).exists()).toBe(true);
    });

    it("runs the collectionName watcher when the collection changes", async () => {
      const wrapper = mount(RoleGenApp);
      await goToPage3(wrapper);

      void getHandler("getCollectionList")?.([
        { fqcn: "namespace.collection" },
        { fqcn: "other.collection" },
      ]);
      await flushPromises();

      // Changing the collection name pre-save exercises the watch(collectionName)
      // callback (filesWereSaved is false, so it stays false and Save enables).
      await wrapper.find("input").setValue("namespace.collection");
      await flushPromises();

      const saveButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Save files");
      expect(saveButton?.attributes("disabled")).toBe("false");
      expect(
        wrapper.findComponent({ name: "CollectionSelector" }).exists(),
      ).toBe(true);
    });
  });

  describe("errorMessage handler", () => {
    it("stops loading and renders the error text", async () => {
      const wrapper = mount(RoleGenApp);
      void getHandler("errorMessage")?.("Role boom");
      await flushPromises();

      expect(wrapper.find(".progress-spinner").exists()).toBe(false);
      expect(wrapper.text()).toContain("Role boom");
    });
  });

  describe("watch(prompt)", () => {
    it("clears role name, outline and response when the prompt changes", async () => {
      const wrapper = mount(RoleGenApp);

      void getHandler("generateRole")?.(sampleResponse);
      await flushPromises();

      const backButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Back");
      await backButton?.trigger("click");
      await flushPromises();

      await wrapper.find("input").setValue("a totally new role prompt");
      await flushPromises();

      vi.mocked(vscodeApi.post).mockClear();
      const analyze = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Analyze");
      await analyze?.trigger("click");
      await flushPromises();

      // roleName + outline were reset by watch(prompt).
      expect(vscodeApi.post).toHaveBeenCalledWith("generateRole", {
        name: "",
        text: "a totally new role prompt",
        outline: "",
      });
    });
  });
});
