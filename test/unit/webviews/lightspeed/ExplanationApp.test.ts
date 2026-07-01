import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ExplanationApp from "@webviews/lightspeed/src/ExplanationApp.vue";
import { vscodeApi } from "@webviews/lightspeed/src/utils/vscode";

function getHandler(name: string) {
  return vi
    .mocked(vscodeApi.on)
    .mock.calls.find((call) => call[0] === name)?.[1];
}

describe("ExplanationApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    const wrapper = mount(ExplanationApp);
    expect(wrapper.find(".codicon-loading").exists()).toBe(true);
  });

  it("requests telemetry status on mount", async () => {
    mount(ExplanationApp);
    await flushPromises();
    expect(vscodeApi.post).toHaveBeenCalledWith("getTelemetryStatus", {});
  });

  it("registers message handlers on mount", () => {
    mount(ExplanationApp);
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "explainPlaybook",
      expect.any(Function),
    );
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "explainRole",
      expect.any(Function),
    );
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "setPlaybookData",
      expect.any(Function),
    );
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "setRoleData",
      expect.any(Function),
    );
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "errorMessage",
      expect.any(Function),
    );
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "telemetryStatus",
      expect.any(Function),
    );
  });

  describe("playbook explanation", () => {
    it("shows loading with filename when playbook data is set", async () => {
      const wrapper = mount(ExplanationApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const setPlaybookDataHandler = onCalls.find(
        (call) => call[0] === "setPlaybookData",
      )?.[1];

      void setPlaybookDataHandler?.({
        content: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        fileName: "/path/to/playbook.yml",
      });
      await flushPromises();

      expect(wrapper.text()).toContain("playbook.yml");
    });

    it("displays explanation when received", async () => {
      const wrapper = mount(ExplanationApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;

      // Set playbook data first
      const setPlaybookDataHandler = onCalls.find(
        (call) => call[0] === "setPlaybookData",
      )?.[1];
      void setPlaybookDataHandler?.({
        content: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        fileName: "/path/to/playbook.yml",
      });
      await flushPromises();

      // Simulate explanation response
      const explainPlaybookHandler = onCalls.find(
        (call) => call[0] === "explainPlaybook",
      )?.[1];
      void explainPlaybookHandler?.({
        content: "# Playbook Explanation\n\nThis playbook does something.",
      });
      await flushPromises();

      expect(wrapper.find(".explanation").exists()).toBe(true);
      expect(wrapper.html()).toContain("Playbook Explanation");
    });

    it("shows no explanation message when empty response", async () => {
      const wrapper = mount(ExplanationApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;

      // Set playbook data first
      const setPlaybookDataHandler = onCalls.find(
        (call) => call[0] === "setPlaybookData",
      )?.[1];
      void setPlaybookDataHandler?.({
        content: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        fileName: "/path/to/playbook.yml",
      });
      await flushPromises();

      // Simulate empty explanation response
      const explainPlaybookHandler = onCalls.find(
        (call) => call[0] === "explainPlaybook",
      )?.[1];
      void explainPlaybookHandler?.({ content: "" });
      await flushPromises();

      expect(wrapper.html()).toContain("No explanation provided");
    });

    it("shows no tasks message when playbook has no tasks", async () => {
      const wrapper = mount(ExplanationApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;

      // Set playbook data without tasks
      const setPlaybookDataHandler = onCalls.find(
        (call) => call[0] === "setPlaybookData",
      )?.[1];
      void setPlaybookDataHandler?.({
        content: "- hosts: all\n  vars:\n    foo: bar",
        fileName: "/path/to/playbook.yml",
      });
      await flushPromises();

      expect(wrapper.text()).toContain(
        "Explaining a playbook with no tasks in the playbook is not supported",
      );
    });
  });

  describe("role explanation", () => {
    it("shows loading with role name when role data is set", async () => {
      const wrapper = mount(ExplanationApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const setRoleDataHandler = onCalls.find(
        (call) => call[0] === "setRoleData",
      )?.[1];

      void setRoleDataHandler?.({
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        roleName: "my_role",
      });
      await flushPromises();

      expect(wrapper.text()).toContain("my_role");
    });

    it("displays role explanation when received", async () => {
      const wrapper = mount(ExplanationApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;

      // Set role data first
      const setRoleDataHandler = onCalls.find(
        (call) => call[0] === "setRoleData",
      )?.[1];
      void setRoleDataHandler?.({
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        roleName: "my_role",
      });
      await flushPromises();

      // Simulate explanation response
      const explainRoleHandler = onCalls.find(
        (call) => call[0] === "explainRole",
      )?.[1];
      void explainRoleHandler?.({
        content: "# Role Explanation\n\nThis role configures something.",
      });
      await flushPromises();

      expect(wrapper.find(".explanation").exists()).toBe(true);
      expect(wrapper.html()).toContain("Role Explanation");
    });
  });

  describe("error handling", () => {
    it("displays error message when received", async () => {
      const wrapper = mount(ExplanationApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const errorHandler = onCalls.find(
        (call) => call[0] === "errorMessage",
      )?.[1];

      void errorHandler?.("Something went wrong");
      await flushPromises();

      expect(wrapper.find(".codicon-error").exists()).toBe(true);
      expect(wrapper.text()).toContain("Something went wrong");
    });
  });

  describe("feedback box", () => {
    it("shows feedback box after explanation is displayed", async () => {
      const wrapper = mount(ExplanationApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;

      // Set playbook data first
      const setPlaybookDataHandler = onCalls.find(
        (call) => call[0] === "setPlaybookData",
      )?.[1];
      void setPlaybookDataHandler?.({
        content: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        fileName: "/path/to/playbook.yml",
      });
      await flushPromises();

      // Simulate explanation response
      const explainPlaybookHandler = onCalls.find(
        (call) => call[0] === "explainPlaybook",
      )?.[1];
      void explainPlaybookHandler?.({
        content: "# Playbook Explanation\n\nThis playbook does something.",
      });
      await flushPromises();

      expect(wrapper.findComponent({ name: "FeedbackBox" }).exists()).toBe(
        true,
      );
    });
  });

  describe("telemetry status", () => {
    it("updates telemetry status when received", async () => {
      const wrapper = mount(ExplanationApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const telemetryHandler = onCalls.find(
        (call) => call[0] === "telemetryStatus",
      )?.[1];

      void telemetryHandler?.({ enabled: false });
      await flushPromises();

      // Set up explanation to show feedback box
      const setPlaybookDataHandler = onCalls.find(
        (call) => call[0] === "setPlaybookData",
      )?.[1];
      void setPlaybookDataHandler?.({
        content: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        fileName: "/path/to/playbook.yml",
      });
      await flushPromises();

      const explainPlaybookHandler = onCalls.find(
        (call) => call[0] === "explainPlaybook",
      )?.[1];
      void explainPlaybookHandler?.({
        content: "# Explanation",
      });
      await flushPromises();

      const feedbackBox = wrapper.findComponent({ name: "FeedbackBox" });
      expect(feedbackBox.props("telemetryEnabled")).toBe(false);
    });
  });

  describe("role explanation - empty content fallback", () => {
    it("shows the no-explanation fallback when explainRole returns empty content", async () => {
      const wrapper = mount(ExplanationApp);

      void getHandler("setRoleData")?.({
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        roleName: "my_role",
      });
      await flushPromises();

      void getHandler("explainRole")?.({ content: "" });
      await flushPromises();

      expect(wrapper.html()).toContain("No explanation provided");
    });
  });

  describe("watcher guard branches (no fetch triggered)", () => {
    it("does not fetch a playbook explanation when fileName is missing", async () => {
      mount(ExplanationApp);
      vi.mocked(vscodeApi.post).mockClear();

      // content truthy but fileName falsy -> watch short-circuits, no fetch.
      void getHandler("setPlaybookData")?.({
        content: "- hosts: all\n  tasks: []",
        fileName: "",
      });
      await flushPromises();

      expect(vscodeApi.post).not.toHaveBeenCalledWith(
        "explainPlaybook",
        expect.anything(),
      );
    });

    it("does not fetch a playbook explanation when content is empty", async () => {
      const wrapper = mount(ExplanationApp);
      vi.mocked(vscodeApi.post).mockClear();

      void getHandler("setPlaybookData")?.({
        content: "",
        fileName: "/path/to/playbook.yml",
      });
      await flushPromises();

      expect(vscodeApi.post).not.toHaveBeenCalledWith(
        "explainPlaybook",
        expect.anything(),
      );
      // Still in the initial loading state (fetch never ran).
      expect(wrapper.find(".codicon-loading").exists()).toBe(true);
    });

    it("does not fetch a role explanation when files is empty", async () => {
      mount(ExplanationApp);
      vi.mocked(vscodeApi.post).mockClear();

      // files.length === 0 -> watch short-circuits.
      void getHandler("setRoleData")?.({ files: [], roleName: "my_role" });
      await flushPromises();

      expect(vscodeApi.post).not.toHaveBeenCalledWith(
        "explainRole",
        expect.anything(),
      );
    });

    it("does not fetch a role explanation when roleName is missing", async () => {
      mount(ExplanationApp);
      vi.mocked(vscodeApi.post).mockClear();

      // files present but roleName falsy -> watch short-circuits.
      void getHandler("setRoleData")?.({
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hi" }],
        roleName: "",
      });
      await flushPromises();

      expect(vscodeApi.post).not.toHaveBeenCalledWith(
        "explainRole",
        expect.anything(),
      );
    });
  });
});
