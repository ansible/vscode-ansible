import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ExplanationApp from "../../../../webviews/lightspeed/src/ExplanationApp.vue";
import { vscodeApi } from "../../../../webviews/lightspeed/src/utils/vscode";

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

      setPlaybookDataHandler?.({
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
      setPlaybookDataHandler?.({
        content: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        fileName: "/path/to/playbook.yml",
      });
      await flushPromises();

      // Simulate explanation response
      const explainPlaybookHandler = onCalls.find(
        (call) => call[0] === "explainPlaybook",
      )?.[1];
      explainPlaybookHandler?.({
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
      setPlaybookDataHandler?.({
        content: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        fileName: "/path/to/playbook.yml",
      });
      await flushPromises();

      // Simulate empty explanation response
      const explainPlaybookHandler = onCalls.find(
        (call) => call[0] === "explainPlaybook",
      )?.[1];
      explainPlaybookHandler?.({ content: "" });
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
      setPlaybookDataHandler?.({
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

      setRoleDataHandler?.({
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
      setRoleDataHandler?.({
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        roleName: "my_role",
      });
      await flushPromises();

      // Simulate explanation response
      const explainRoleHandler = onCalls.find(
        (call) => call[0] === "explainRole",
      )?.[1];
      explainRoleHandler?.({
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

      errorHandler?.("Something went wrong");
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
      setPlaybookDataHandler?.({
        content: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        fileName: "/path/to/playbook.yml",
      });
      await flushPromises();

      // Simulate explanation response
      const explainPlaybookHandler = onCalls.find(
        (call) => call[0] === "explainPlaybook",
      )?.[1];
      explainPlaybookHandler?.({
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

      telemetryHandler?.({ enabled: false });
      await flushPromises();

      // Set up explanation to show feedback box
      const setPlaybookDataHandler = onCalls.find(
        (call) => call[0] === "setPlaybookData",
      )?.[1];
      setPlaybookDataHandler?.({
        content: "- hosts: all\n  tasks:\n    - debug: msg=hello",
        fileName: "/path/to/playbook.yml",
      });
      await flushPromises();

      const explainPlaybookHandler = onCalls.find(
        (call) => call[0] === "explainPlaybook",
      )?.[1];
      explainPlaybookHandler?.({
        content: "# Explanation",
      });
      await flushPromises();

      const feedbackBox = wrapper.findComponent({ name: "FeedbackBox" });
      expect(feedbackBox.props("telemetryEnabled")).toBe(false);
    });
  });
});
