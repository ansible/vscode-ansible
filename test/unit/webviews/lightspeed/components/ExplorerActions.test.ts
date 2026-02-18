import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ExplorerActions from "../../../../../webviews/lightspeed/src/components/ExplorerActions.vue";

describe("ExplorerActions", () => {
  const defaultProps = {
    userContent: "",
    hasPlaybookOpened: false,
    hasRoleOpened: false,
  };

  it("renders the active session container", () => {
    const wrapper = mount(ExplorerActions, { props: defaultProps });
    expect(wrapper.find(".active-session").exists()).toBe(true);
  });

  describe("Generate Playbook button", () => {
    it("renders the button", () => {
      const wrapper = mount(ExplorerActions, { props: defaultProps });
      const button = wrapper.find(
        "#lightspeed-explorer-playbook-generation-submit",
      );
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe("Generate a playbook");
    });

    it("emits generatePlaybook event when clicked", async () => {
      const wrapper = mount(ExplorerActions, { props: defaultProps });
      const button = wrapper.find(
        "#lightspeed-explorer-playbook-generation-submit",
      );
      await button.trigger("click");
      expect(wrapper.emitted()).toHaveProperty("generatePlaybook");
    });
  });

  describe("Explain Playbook button", () => {
    it("renders the button", () => {
      const wrapper = mount(ExplorerActions, { props: defaultProps });
      const button = wrapper.find(
        "#lightspeed-explorer-playbook-explanation-submit",
      );
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe("Explain the current playbook");
    });

    it("is disabled when hasPlaybookOpened is false", () => {
      const wrapper = mount(ExplorerActions, { props: defaultProps });
      const button = wrapper.find(
        "#lightspeed-explorer-playbook-explanation-submit",
      );
      expect(button.attributes("disabled")).toBeDefined();
    });

    it("is enabled when hasPlaybookOpened is true", () => {
      const wrapper = mount(ExplorerActions, {
        props: { ...defaultProps, hasPlaybookOpened: true },
      });
      const button = wrapper.find(
        "#lightspeed-explorer-playbook-explanation-submit",
      );
      // When disabled is false, the attribute should not be present or be false
      const disabledAttr = button.attributes("disabled");
      expect(
        disabledAttr === undefined || disabledAttr === "false",
      ).toBeTruthy();
    });

    it("emits explainPlaybook event when clicked", async () => {
      const wrapper = mount(ExplorerActions, {
        props: { ...defaultProps, hasPlaybookOpened: true },
      });
      const button = wrapper.find(
        "#lightspeed-explorer-playbook-explanation-submit",
      );
      await button.trigger("click");
      expect(wrapper.emitted()).toHaveProperty("explainPlaybook");
    });
  });

  describe("Generate Role button", () => {
    it("renders the button", () => {
      const wrapper = mount(ExplorerActions, { props: defaultProps });
      const button = wrapper.find(
        "#lightspeed-explorer-role-generation-submit",
      );
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe("Generate a role");
    });

    it("emits generateRole event when clicked", async () => {
      const wrapper = mount(ExplorerActions, { props: defaultProps });
      const button = wrapper.find(
        "#lightspeed-explorer-role-generation-submit",
      );
      await button.trigger("click");
      expect(wrapper.emitted()).toHaveProperty("generateRole");
    });
  });

  describe("Explain Role button", () => {
    it("renders the button", () => {
      const wrapper = mount(ExplorerActions, { props: defaultProps });
      const button = wrapper.find(
        "#lightspeed-explorer-role-explanation-submit",
      );
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe("Explain the current role");
    });

    it("is disabled when hasRoleOpened is false", () => {
      const wrapper = mount(ExplorerActions, { props: defaultProps });
      const button = wrapper.find(
        "#lightspeed-explorer-role-explanation-submit",
      );
      expect(button.attributes("disabled")).toBeDefined();
    });

    it("is enabled when hasRoleOpened is true", () => {
      const wrapper = mount(ExplorerActions, {
        props: { ...defaultProps, hasRoleOpened: true },
      });
      const button = wrapper.find(
        "#lightspeed-explorer-role-explanation-submit",
      );
      // When disabled is false, the attribute should not be present or be false
      const disabledAttr = button.attributes("disabled");
      expect(
        disabledAttr === undefined || disabledAttr === "false",
      ).toBeTruthy();
    });

    it("emits explainRole event when clicked", async () => {
      const wrapper = mount(ExplorerActions, {
        props: { ...defaultProps, hasRoleOpened: true },
      });
      const button = wrapper.find(
        "#lightspeed-explorer-role-explanation-submit",
      );
      await button.trigger("click");
      expect(wrapper.emitted()).toHaveProperty("explainRole");
    });
  });
});
