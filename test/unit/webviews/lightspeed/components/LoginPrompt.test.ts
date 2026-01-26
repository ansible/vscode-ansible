import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LoginPrompt from "../../../../../webviews/lightspeed/src/components/LoginPrompt.vue";

describe("LoginPrompt", () => {
  it("renders the login form", () => {
    const wrapper = mount(LoginPrompt);
    expect(wrapper.find(".login-form").exists()).toBe(true);
  });

  it("displays the promotional text", () => {
    const wrapper = mount(LoginPrompt);
    expect(wrapper.text()).toContain(
      "Experience smarter automation using Ansible Lightspeed",
    );
  });

  it("contains a Learn more link with correct href", () => {
    const wrapper = mount(LoginPrompt);
    const link = wrapper.find("a");
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe("Learn more");
    expect(link.attributes("href")).toBe(
      "https://www.redhat.com/en/engage/project-wisdom",
    );
    expect(link.attributes("target")).toBe("_blank");
  });

  it("renders the Connect button", () => {
    const wrapper = mount(LoginPrompt);
    const button = wrapper.find("#lightspeed-explorer-connect");
    expect(button.exists()).toBe(true);
    expect(button.text()).toBe("Connect");
  });

  it("emits connect event when Connect button is clicked", async () => {
    const wrapper = mount(LoginPrompt);
    const button = wrapper.find("#lightspeed-explorer-connect");
    await button.trigger("click");
    expect(wrapper.emitted()).toHaveProperty("connect");
    expect(wrapper.emitted("connect")).toHaveLength(1);
  });
});
