import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import GeneratedFileEntry from "../../../../../../webviews/lightspeed/src/components/lightspeed/GeneratedFileEntry.vue";
import { RoleFileType } from "../../../../../../src/interfaces/lightspeed";

describe("GeneratedFileEntry", () => {
  const defaultProps = {
    file: {
      path: "tasks/main.yml",
      content: "- name: Test task\n  debug:\n    msg: Hello",
      file_type: RoleFileType.Task,
    },
  };

  it("renders as a list item", () => {
    const wrapper = mount(GeneratedFileEntry, {
      props: defaultProps,
    });
    expect(wrapper.find("li").exists()).toBe(true);
  });

  it("displays the file path", () => {
    const wrapper = mount(GeneratedFileEntry, {
      props: defaultProps,
    });
    expect(wrapper.text()).toContain("tasks/main.yml");
  });

  it("renders code highlighting", () => {
    const wrapper = mount(GeneratedFileEntry, {
      props: defaultProps,
    });
    // The component uses highlightjs which is stubbed in vitestSetup
    // We verify the code content is rendered
    expect(wrapper.find("pre").exists()).toBe(true);
  });

  it("handles different file paths", () => {
    const wrapper = mount(GeneratedFileEntry, {
      props: {
        file: {
          path: "defaults/main.yml",
          content: "my_var: value",
          file_type: RoleFileType.Default,
        },
      },
    });
    expect(wrapper.text()).toContain("defaults/main.yml");
  });

  it("handles empty content", () => {
    const wrapper = mount(GeneratedFileEntry, {
      props: {
        file: {
          path: "handlers/main.yml",
          content: "",
          file_type: RoleFileType.Handler,
        },
      },
    });
    expect(wrapper.find("li").exists()).toBe(true);
  });
});
