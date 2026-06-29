import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SavedFiles from "@webviews/lightspeed/src/components/SavedFiles.vue";
import { vscodeApi } from "@webviews/lightspeed/src/utils/vscode";
import { RoleFileType } from "@src/interfaces/lightspeed";

// NOTE: the `roleLocation` v-if block in SavedFiles.vue is dead code -- the ref
// is initialised to "" and never reassigned, so those two template conditions
// stay intentionally uncovered.

describe("SavedFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts writeRoleInWorkspace on mount with the mapped file payload", async () => {
    vi.mocked(vscodeApi.postAndReceive).mockResolvedValueOnce([]);

    mount(SavedFiles, {
      props: {
        files: [
          {
            path: "tasks/main.yml",
            file_type: RoleFileType.Task,
            content: "x",
          },
          {
            path: "defaults/main.yml",
            file_type: RoleFileType.Default,
            content: "y",
          },
        ],
        roleName: "myrole",
        collectionName: "ns.coll",
      },
    });
    await flushPromises();

    expect(vscodeApi.postAndReceive).toHaveBeenCalledWith(
      "writeRoleInWorkspace",
      {
        files: [
          ["tasks/main.yml", "x", RoleFileType.Task],
          ["defaults/main.yml", "y", RoleFileType.Default],
        ],
        collectionName: "ns.coll",
        roleName: "myrole",
      },
    );
  });

  it("renders one SavedFilesEntry per resolved entry", async () => {
    vi.mocked(vscodeApi.postAndReceive).mockResolvedValueOnce([
      { longPath: "/a/tasks/main.yml", command: "open-a" },
      { longPath: "/a/defaults/main.yml", command: "open-b" },
    ]);

    const wrapper = mount(SavedFiles, {
      props: {
        files: [],
        roleName: "myrole",
        collectionName: "ns.coll",
      },
    });
    await flushPromises();

    expect(wrapper.findAllComponents({ name: "SavedFilesEntry" })).toHaveLength(
      2,
    );
  });
});
