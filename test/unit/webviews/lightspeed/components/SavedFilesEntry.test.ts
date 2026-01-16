import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SavedFilesEntry from "../../../../../webviews/lightspeed/src/components/SavedFilesEntry.vue";

describe("SavedFilesEntry", () => {
  const defaultProps = {
    longPath: "my_namespace/my_collection/roles/my_role/tasks/main.yml",
    command: "command:vscode.open?file:///path/to/file.yml",
  };

  it("renders as a list item", () => {
    const wrapper = mount(SavedFilesEntry, { props: defaultProps });
    expect(wrapper.find("li").exists()).toBe(true);
  });

  it("displays the long path as link text", () => {
    const wrapper = mount(SavedFilesEntry, { props: defaultProps });
    const link = wrapper.find("a");
    expect(link.text()).toBe(defaultProps.longPath);
  });

  it("sets the command as href", () => {
    const wrapper = mount(SavedFilesEntry, { props: defaultProps });
    const link = wrapper.find("a");
    expect(link.attributes("href")).toBe(defaultProps.command);
  });

  it("renders link element", () => {
    const wrapper = mount(SavedFilesEntry, { props: defaultProps });
    expect(wrapper.find("a").exists()).toBe(true);
  });

  it("handles different file paths", () => {
    const wrapper = mount(SavedFilesEntry, {
      props: {
        longPath: "different/path/to/file.yml",
        command: "command:different",
      },
    });
    expect(wrapper.find("a").text()).toBe("different/path/to/file.yml");
  });

  it("handles long paths correctly", () => {
    const longPath =
      "very/long/path/to/a/deeply/nested/collection/roles/role_name/tasks/main.yml";
    const wrapper = mount(SavedFilesEntry, {
      props: {
        longPath,
        command: "command:open",
      },
    });
    expect(wrapper.find("a").text()).toBe(longPath);
  });
});
