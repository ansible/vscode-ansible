import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FinalPreviewAsync from "@webviews/lightspeed/src/components/lightspeed/FinalPreviewAsync.vue";
import { RoleFileType } from "@src/interfaces/lightspeed";

describe("FinalPreviewAsync", () => {
  it("renders the heading and an empty list when response is undefined", () => {
    const wrapper = mount(FinalPreviewAsync, {
      props: { response: undefined },
    });
    expect(wrapper.find("h4").text()).toContain(
      "The following role was generated for you",
    );
    expect(
      wrapper.findAllComponents({ name: "GeneratedFileEntry" }),
    ).toHaveLength(0);
  });

  it("renders one GeneratedFileEntry per file with the file prop", () => {
    const files = [
      { path: "a.yml", file_type: RoleFileType.Task, content: "a" },
      { path: "b.yml", file_type: RoleFileType.Default, content: "b" },
    ];
    const wrapper = mount(FinalPreviewAsync, {
      props: {
        response: {
          files,
          generationId: "gen-1",
          name: "myrole",
        },
      },
    });
    const entries = wrapper.findAllComponents({ name: "GeneratedFileEntry" });
    expect(entries).toHaveLength(2);
    expect(entries[0].props("file")).toEqual(files[0]);
    expect(entries[1].props("file")).toEqual(files[1]);
  });
});
