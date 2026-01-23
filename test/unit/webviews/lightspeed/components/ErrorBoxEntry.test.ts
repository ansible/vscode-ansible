import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ErrorBoxEntry from "../../../../../webviews/lightspeed/src/components/ErrorBoxEntry.vue";

describe("ErrorBoxEntry", () => {
  it("renders the error message", () => {
    const wrapper = mount(ErrorBoxEntry, {
      props: {
        message: "Test error message",
      },
    });
    expect(wrapper.text()).toContain("Test error message");
  });

  it("renders as a list item", () => {
    const wrapper = mount(ErrorBoxEntry, {
      props: {
        message: "Error",
      },
    });
    expect(wrapper.find("li").exists()).toBe(true);
  });

  it("displays warning icon", () => {
    const wrapper = mount(ErrorBoxEntry, {
      props: {
        message: "Error",
      },
    });
    expect(wrapper.find(".codicon-warning").exists()).toBe(true);
  });

  it("handles long error messages", () => {
    const longMessage =
      "This is a very long error message that should still be displayed correctly in the error box entry component";
    const wrapper = mount(ErrorBoxEntry, {
      props: {
        message: longMessage,
      },
    });
    expect(wrapper.text()).toContain(longMessage);
  });

  it("handles special characters in error message", () => {
    const specialMessage = "Error: <script>alert('xss')</script> & special chars";
    const wrapper = mount(ErrorBoxEntry, {
      props: {
        message: specialMessage,
      },
    });
    expect(wrapper.text()).toContain("Error:");
    expect(wrapper.text()).toContain("& special chars");
  });
});
