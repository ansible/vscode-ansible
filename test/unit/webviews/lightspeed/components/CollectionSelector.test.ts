import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import CollectionSelector from "../../../../../webviews/lightspeed/src/components/CollectionSelector.vue";
import { vscodeApi } from "../../../../../webviews/lightspeed/src/utils/vscode";

describe("CollectionSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests collection list on mount", async () => {
    mount(CollectionSelector, {
      props: {
        collectionName: "",
      },
    });
    await flushPromises();
    expect(vscodeApi.post).toHaveBeenCalledWith("getCollectionList", {});
  });

  it("registers getCollectionList handler on mount", () => {
    mount(CollectionSelector, {
      props: {
        collectionName: "",
      },
    });
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "getCollectionList",
      expect.any(Function),
    );
  });

  it("shows message when no collections found", async () => {
    const wrapper = mount(CollectionSelector, {
      props: {
        collectionName: "",
      },
    });

    // Collections list is empty by default
    await flushPromises();

    expect(wrapper.text()).toContain(
      "We need a collection to store your new role",
    );
    expect(wrapper.text()).toContain("none were found in your Workspace");
  });

  it("shows create collection link when no collections found", async () => {
    const wrapper = mount(CollectionSelector, {
      props: {
        collectionName: "",
      },
    });
    await flushPromises();

    const link = wrapper.find(
      'a[href="command:ansible.content-creator.create-ansible-collection"]',
    );
    expect(link.exists()).toBe(true);
    expect(wrapper.text()).toContain("Create new Ansible collection");
  });

  it("shows dropdown when collections are available", async () => {
    const wrapper = mount(CollectionSelector, {
      props: {
        collectionName: "",
      },
    });

    const onCalls = vi.mocked(vscodeApi.on).mock.calls;
    const collectionHandler = onCalls.find(
      (call) => call[0] === "getCollectionList",
    )?.[1];

    collectionHandler?.([
      { fqcn: "my_namespace.my_collection", path: "/path/to/collection" },
    ]);
    await flushPromises();

    expect(wrapper.find("#collectionSelectorContainer").exists()).toBe(true);
    expect(wrapper.findComponent({ name: "AutoComplete" }).exists()).toBe(true);
  });

  it("displays collection selection label", async () => {
    const wrapper = mount(CollectionSelector, {
      props: {
        collectionName: "",
      },
    });

    const onCalls = vi.mocked(vscodeApi.on).mock.calls;
    const collectionHandler = onCalls.find(
      (call) => call[0] === "getCollectionList",
    )?.[1];

    collectionHandler?.([
      { fqcn: "my_namespace.my_collection", path: "/path/to/collection" },
    ]);
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Select the collection to create role in:",
    );
  });

  it("displays informational text about collections and roles", async () => {
    const wrapper = mount(CollectionSelector, {
      props: {
        collectionName: "",
      },
    });

    const onCalls = vi.mocked(vscodeApi.on).mock.calls;
    const collectionHandler = onCalls.find(
      (call) => call[0] === "getCollectionList",
    )?.[1];

    collectionHandler?.([
      { fqcn: "my_namespace.my_collection", path: "/path/to/collection" },
    ]);
    await flushPromises();

    expect(wrapper.text()).toContain(
      "A collection can contain one or more roles",
    );
  });

  it("emits update:collectionName when selection changes", async () => {
    const wrapper = mount(CollectionSelector, {
      props: {
        collectionName: "",
        "onUpdate:collectionName": (value: string | undefined): void => {
          wrapper.setProps({ collectionName: value ?? "" });
        },
      },
    }) as VueWrapper<InstanceType<typeof CollectionSelector>>;

    const onCalls = vi.mocked(vscodeApi.on).mock.calls;
    const collectionHandler = onCalls.find(
      (call) => call[0] === "getCollectionList",
    )?.[1];

    collectionHandler?.([
      { fqcn: "my_namespace.my_collection", path: "/path/to/collection" },
    ]);
    await flushPromises();

    const input = wrapper.find("input");
    await input.setValue("my_namespace.my_collection");
    await flushPromises();

    expect(wrapper.emitted("update:collectionName")).toBeTruthy();
  });
});
