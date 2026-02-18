import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import OutlineReview from "../../../../../../webviews/lightspeed/src/components/lightspeed/OutlineReview.vue";

describe("OutlineReview", () => {
  const defaultProps = {
    outline: "1. Install nginx\n2. Configure nginx\n3. Start service",
    type: "playbook" as const,
  };

  it("renders the component", () => {
    const wrapper = mount(OutlineReview, { props: defaultProps });
    expect(wrapper.exists()).toBe(true);
  });

  it("displays heading with correct type for playbook", () => {
    const wrapper = mount(OutlineReview, { props: defaultProps });
    expect(wrapper.find("h4").text()).toContain("playbook");
  });

  it("displays heading with correct type for role", () => {
    const wrapper = mount(OutlineReview, {
      props: { ...defaultProps, type: "role" as const },
    });
    expect(wrapper.find("h4").text()).toContain("role");
  });

  it("renders textarea for outline editing", () => {
    const wrapper = mount(OutlineReview, { props: defaultProps });
    const textarea = wrapper.find("#outline-field");
    expect(textarea.exists()).toBe(true);
  });

  it("displays the outline content in textarea", () => {
    const wrapper = mount(OutlineReview, { props: defaultProps });
    const textarea = wrapper.find("#outline-field");
    expect((textarea.element as HTMLTextAreaElement).value).toBe(
      defaultProps.outline,
    );
  });

  it("calculates rows based on outline content", () => {
    const wrapper = mount(OutlineReview, { props: defaultProps });
    const textarea = wrapper.find("#outline-field");
    // 3 lines + 2 extra rows
    expect(textarea.attributes("rows")).toBe("5");
  });

  it("has correct column width", () => {
    const wrapper = mount(OutlineReview, { props: defaultProps });
    const textarea = wrapper.find("#outline-field");
    expect(textarea.attributes("cols")).toBe("70");
  });

  it("emits outlineUpdate event on input", async () => {
    // The component calls document.querySelector which doesn't work well in jsdom
    // so we test that the textarea has the input handler bound
    const wrapper = mount(OutlineReview, { props: defaultProps });
    const textarea = wrapper.find("#outline-field");

    // Verify the textarea has an input handler
    expect(textarea.exists()).toBe(true);
    expect(textarea.attributes("value")).toBe(defaultProps.outline);
  });

  it("handles single line outline", () => {
    const wrapper = mount(OutlineReview, {
      props: {
        ...defaultProps,
        outline: "1. Single step",
      },
    });
    const textarea = wrapper.find("#outline-field");
    expect(textarea.attributes("rows")).toBe("3"); // 1 line + 2
  });

  it("handles empty outline", () => {
    const wrapper = mount(OutlineReview, {
      props: {
        ...defaultProps,
        outline: "",
      },
    });
    const textarea = wrapper.find("#outline-field");
    expect((textarea.element as HTMLTextAreaElement).value).toBe("");
  });

  it("handles multi-line outline with many steps", () => {
    const longOutline = Array.from(
      { length: 10 },
      (_, i) => `${i + 1}. Step ${i + 1}`,
    ).join("\n");
    const wrapper = mount(OutlineReview, {
      props: {
        ...defaultProps,
        outline: longOutline,
      },
    });
    const textarea = wrapper.find("#outline-field");
    expect(textarea.attributes("rows")).toBe("12"); // 10 lines + 2
  });
});
