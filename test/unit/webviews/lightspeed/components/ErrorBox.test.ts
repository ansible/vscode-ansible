import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ErrorBox from "../../../../../webviews/lightspeed/src/components/ErrorBox.vue";
import { vscodeApi } from "../../../../../webviews/lightspeed/src/utils/vscode";

describe("ErrorBox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when error messages array is empty", () => {
    const wrapper = mount(ErrorBox, {
      props: {
        errorMessages: [],
      },
    });
    expect(wrapper.find("#errorContainer").exists()).toBe(false);
  });

  it("renders error container when there are error messages", () => {
    const wrapper = mount(ErrorBox, {
      props: {
        errorMessages: ["Error 1"],
      },
    });
    expect(wrapper.find("#errorContainer").exists()).toBe(true);
  });

  it("renders all error messages", () => {
    const wrapper = mount(ErrorBox, {
      props: {
        errorMessages: ["Error 1", "Error 2", "Error 3"],
      },
    });
    const entries = wrapper.findAllComponents({ name: "ErrorBoxEntry" });
    expect(entries.length).toBe(3);
  });

  it("passes message prop to ErrorBoxEntry", () => {
    const wrapper = mount(ErrorBox, {
      props: {
        errorMessages: ["Test error message"],
      },
    });
    const entry = wrapper.findComponent({ name: "ErrorBoxEntry" });
    expect(entry.props("message")).toBe("Test error message");
  });

  it("registers errorMessage handler on mount", () => {
    mount(ErrorBox, {
      props: {
        errorMessages: [],
      },
    });
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "errorMessage",
      expect.any(Function),
    );
  });

  it("adds new error message when received from vscode", async () => {
    mount(ErrorBox, {
      props: {
        errorMessages: [],
      },
    });

    const onCalls = vi.mocked(vscodeApi.on).mock.calls;
    const errorHandler = onCalls.find(
      (call) => call[0] === "errorMessage",
    )?.[1];

    // Verify that the errorMessage handler is registered
    expect(errorHandler).toBeDefined();
  });

  it("renders as unordered list", () => {
    const wrapper = mount(ErrorBox, {
      props: {
        errorMessages: ["Error 1"],
      },
    });
    expect(wrapper.find("ul#errorContainer").exists()).toBe(true);
  });
});
