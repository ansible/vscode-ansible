import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StatusBoxCollectionName from "@webviews/lightspeed/src/components/lightspeed/StatusBoxCollectionName.vue";

describe("StatusBoxCollectionName", () => {
  it("renders the collection name", () => {
    const wrapper = mount(StatusBoxCollectionName, {
      props: { collectionName: "ns.coll" },
    });
    expect(wrapper.text()).toContain('Collection name: "ns.coll"');
  });

  it("emits restartWizard when the edit anchor is clicked", async () => {
    const wrapper = mount(StatusBoxCollectionName, {
      props: { collectionName: "ns.coll" },
    });
    await wrapper.find("#backAnchorCollectionName").trigger("click");
    expect(wrapper.emitted("restartWizard")).toBeTruthy();
  });
});
