import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PromptExampleBox from "../../../../../../webviews/lightspeed/src/components/lightspeed/PromptExampleBox.vue";

describe("PromptExampleBox", () => {
  it("renders the examples container", () => {
    const wrapper = mount(PromptExampleBox);
    expect(wrapper.find(".examplesContainer").exists()).toBe(true);
  });

  it("displays Examples heading", () => {
    const wrapper = mount(PromptExampleBox);
    expect(wrapper.find("h4").text()).toBe("Examples");
  });

  it("renders example text containers", () => {
    const wrapper = mount(PromptExampleBox);
    const containers = wrapper.findAll(".exampleTextContainer");
    expect(containers.length).toBe(2);
  });

  it("displays IIS websites example", () => {
    const wrapper = mount(PromptExampleBox);
    expect(wrapper.text()).toContain(
      "Create IIS websites on port 8080 and 8081 and open firewall",
    );
  });

  it("displays AWS security group example", () => {
    const wrapper = mount(PromptExampleBox);
    expect(wrapper.text()).toContain(
      "Create a security group named web-servers in AWS",
    );
    expect(wrapper.text()).toContain("allowing inbound SSH access on port 22");
    expect(wrapper.text()).toContain("HTTP access on port 80");
  });

  it("renders examples in paragraph elements", () => {
    const wrapper = mount(PromptExampleBox);
    const paragraphs = wrapper.findAll(".exampleTextContainer p");
    expect(paragraphs.length).toBe(2);
  });
});
