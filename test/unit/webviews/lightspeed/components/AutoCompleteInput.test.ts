import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import AutoCompleteInput from "@webviews/lightspeed/src/components/AutoCompleteInput.vue";

describe("AutoCompleteInput", () => {
  const defaultProps = {
    modelValue: "",
    suggestions: ["alpha", "bravo", "charlie"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders an input element", () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      expect(wrapper.find("input.autocomplete-input").exists()).toBe(true);
    });

    it("applies the placeholder text", () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { ...defaultProps, placeholder: "Type here..." },
      });
      expect(wrapper.find("input").attributes("placeholder")).toBe(
        "Type here...",
      );
    });

    it("does not render the dropdown toggle by default", () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      expect(wrapper.find(".dropdown-toggle").exists()).toBe(false);
    });

    it("renders the dropdown toggle when dropdown prop is true", () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { ...defaultProps, dropdown: true },
      });
      expect(wrapper.find(".dropdown-toggle").exists()).toBe(true);
    });

    it("does not show suggestions list initially", () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      expect(wrapper.find(".autocomplete-list").exists()).toBe(false);
    });
  });

  describe("v-model binding", () => {
    it("reflects the modelValue in the input", () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { ...defaultProps, modelValue: "existing text" },
      });
      expect((wrapper.find("input").element as HTMLInputElement).value).toBe(
        "existing text",
      );
    });

    it("emits update:modelValue on input", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      await wrapper.find("input").setValue("new value");
      expect(wrapper.emitted("update:modelValue")).toBeTruthy();
      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted?.[emitted.length - 1]).toEqual(["new value"]);
    });
  });

  describe("suggestion dropdown", () => {
    it("shows suggestions on focus", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      await wrapper.find("input").trigger("focus");
      await flushPromises();
      expect(wrapper.find(".autocomplete-list").exists()).toBe(true);
      expect(wrapper.findAll(".autocomplete-list li")).toHaveLength(3);
    });

    it("emits complete event on focus", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      await wrapper.find("input").trigger("focus");
      expect(wrapper.emitted("complete")).toBeTruthy();
      expect(wrapper.emitted("complete")?.[0]).toEqual([{ query: "" }]);
    });

    it("emits complete event on input with current value", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { ...defaultProps, modelValue: "al" },
      });
      await wrapper.find("input").trigger("input");
      expect(wrapper.emitted("complete")).toBeTruthy();
      expect(wrapper.emitted("complete")?.[0]).toEqual([{ query: "al" }]);
    });

    it("emits complete with live input value, not stale modelValue", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { ...defaultProps },
        attrs: {
          "onUpdate:modelValue": (v: string) =>
            wrapper.setProps({ modelValue: v }),
        },
      });
      await wrapper.find("input").setValue("my");
      const events = wrapper.emitted("complete") as Array<[{ query: string }]>;
      expect(events[events.length - 1][0].query).toBe("my");
    });

    it("displays each suggestion as a list item", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      const items = wrapper.findAll(".autocomplete-list li");
      expect(items[0].text()).toBe("alpha");
      expect(items[1].text()).toBe("bravo");
      expect(items[2].text()).toBe("charlie");
    });

    it("selects a suggestion on click", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      await wrapper.findAll(".autocomplete-list li")[1].trigger("click");
      await flushPromises();

      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted?.[emitted.length - 1]).toEqual(["bravo"]);
      expect(wrapper.find(".autocomplete-list").exists()).toBe(false);
    });

    it("selects a suggestion on Enter key in list item", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      const items = wrapper.findAll(".autocomplete-list li");
      await items[1].trigger("keydown", { key: "Enter" });
      await flushPromises();

      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted?.[emitted.length - 1]).toEqual(["bravo"]);
    });

    it("selects a suggestion on Space key in list item", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      const items = wrapper.findAll(".autocomplete-list li");
      await items[0].trigger("keydown", { key: " " });
      await flushPromises();

      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted?.[emitted.length - 1]).toEqual(["alpha"]);
    });

    it("hides the dropdown after selection", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      await wrapper.findAll(".autocomplete-list li")[0].trigger("click");
      await flushPromises();

      expect(wrapper.find(".autocomplete-list").exists()).toBe(false);
    });
  });

  describe("keyboard navigation", () => {
    it("highlights next item on ArrowDown", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      const input = wrapper.find("input");
      await input.trigger("focus");
      await flushPromises();

      await input.trigger("keydown", { key: "ArrowDown" });
      await flushPromises();

      const items = wrapper.findAll(".autocomplete-list li");
      expect(items[0].classes()).toContain("active");
    });

    it("wraps around from last to first on ArrowDown", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      const input = wrapper.find("input");
      await input.trigger("focus");
      await flushPromises();

      // Navigate to last item
      await input.trigger("keydown", { key: "ArrowDown" });
      await input.trigger("keydown", { key: "ArrowDown" });
      await input.trigger("keydown", { key: "ArrowDown" });
      // Wrap around
      await input.trigger("keydown", { key: "ArrowDown" });
      await flushPromises();

      const items = wrapper.findAll(".autocomplete-list li");
      expect(items[0].classes()).toContain("active");
    });

    it("highlights previous item on ArrowUp", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      const input = wrapper.find("input");
      await input.trigger("focus");
      await flushPromises();

      // Go down twice, then up once -> should be on first item
      await input.trigger("keydown", { key: "ArrowDown" });
      await input.trigger("keydown", { key: "ArrowDown" });
      await input.trigger("keydown", { key: "ArrowUp" });
      await flushPromises();

      const items = wrapper.findAll(".autocomplete-list li");
      expect(items[0].classes()).toContain("active");
    });

    it("wraps around from first to last on ArrowUp", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      const input = wrapper.find("input");
      await input.trigger("focus");
      await flushPromises();

      await input.trigger("keydown", { key: "ArrowDown" }); // index 0
      await input.trigger("keydown", { key: "ArrowUp" }); // wrap to last
      await flushPromises();

      const items = wrapper.findAll(".autocomplete-list li");
      expect(items[2].classes()).toContain("active");
    });

    it("selects highlighted item on Enter", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      const input = wrapper.find("input");
      await input.trigger("focus");
      await flushPromises();

      await input.trigger("keydown", { key: "ArrowDown" });
      await input.trigger("keydown", { key: "ArrowDown" });
      await input.trigger("keydown", { key: "Enter" });
      await flushPromises();

      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted?.[emitted.length - 1]).toEqual(["bravo"]);
      expect(wrapper.find(".autocomplete-list").exists()).toBe(false);
    });

    it("does nothing on Enter when no item is highlighted", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      const input = wrapper.find("input");
      await input.trigger("focus");
      await flushPromises();

      const emittedBefore = wrapper.emitted("update:modelValue")?.length ?? 0;
      await input.trigger("keydown", { key: "Enter" });
      await flushPromises();

      const emittedAfter = wrapper.emitted("update:modelValue")?.length ?? 0;
      expect(emittedAfter).toBe(emittedBefore);
    });

    it("closes dropdown on Escape", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      const input = wrapper.find("input");
      await input.trigger("focus");
      await flushPromises();

      expect(wrapper.find(".autocomplete-list").exists()).toBe(true);

      await input.trigger("keydown", { key: "Escape" });
      await flushPromises();

      expect(wrapper.find(".autocomplete-list").exists()).toBe(false);
    });

    it("opens dropdown on ArrowDown when closed", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      const input = wrapper.find("input");

      // Dropdown not visible initially
      expect(wrapper.find(".autocomplete-list").exists()).toBe(false);

      await input.trigger("keydown", { key: "ArrowDown" });
      await flushPromises();

      expect(wrapper.emitted("complete")).toBeTruthy();
    });

    it("opens dropdown on ArrowUp when suggestions are empty", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { ...defaultProps, suggestions: [] },
      });
      const input = wrapper.find("input");

      await input.trigger("keydown", { key: "ArrowUp" });
      await flushPromises();

      expect(wrapper.emitted("complete")).toBeTruthy();
    });

    it("ignores keydown during IME composition", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      const input = wrapper.find("input");
      await input.trigger("focus");
      await flushPromises();

      await input.trigger("keydown", {
        key: "ArrowDown",
        isComposing: true,
      });
      await flushPromises();

      const items = wrapper.findAll(".autocomplete-list li");
      expect(items[0].classes()).not.toContain("active");
    });

    it("closes empty message popup on Escape", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: {
          ...defaultProps,
          suggestions: [],
          emptySearchMessage: "No results",
        },
      });
      const input = wrapper.find("input");
      await input.trigger("focus");
      await flushPromises();

      expect(wrapper.find(".autocomplete-empty").exists()).toBe(true);

      await input.trigger("keydown", { key: "Escape" });
      await flushPromises();

      expect(wrapper.find(".autocomplete-empty").exists()).toBe(false);
    });

    it("scrolls active option into view when navigating", async () => {
      const scrollIntoView = vi.fn();
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      const input = wrapper.find("input");
      await input.trigger("focus");
      await flushPromises();

      const list = wrapper.find(".autocomplete-list").element as HTMLElement;
      vi.spyOn(list, "querySelector").mockReturnValue({
        scrollIntoView,
      } as unknown as HTMLElement);

      await input.trigger("keydown", { key: "ArrowDown" });
      await flushPromises();

      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    });
  });

  describe("empty state", () => {
    it("does not show dropdown when suggestions array is empty", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { ...defaultProps, suggestions: [] },
      });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      expect(wrapper.find(".autocomplete-list").exists()).toBe(false);
    });

    it("shows empty message when configured and no suggestions", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: {
          ...defaultProps,
          suggestions: [],
          emptySearchMessage: "No results found",
        },
      });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      expect(wrapper.find(".autocomplete-empty").exists()).toBe(true);
      expect(wrapper.find(".autocomplete-empty").text()).toBe(
        "No results found",
      );
    });

    it("hides empty message when showEmptyMessage is false", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: {
          ...defaultProps,
          suggestions: [],
          showEmptyMessage: false,
          emptySearchMessage: "No results found",
        },
      });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      expect(wrapper.find(".autocomplete-empty").exists()).toBe(false);
    });
  });

  describe("dropdown toggle button", () => {
    it("toggles suggestion list on button click", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { ...defaultProps, dropdown: true },
      });

      // Click toggle to open
      await wrapper.find(".dropdown-toggle").trigger("mousedown");
      await wrapper.find(".dropdown-toggle").trigger("click");
      await flushPromises();

      expect(wrapper.find(".autocomplete-list").exists()).toBe(true);
      expect(wrapper.emitted("complete")).toBeTruthy();

      // Click toggle to close
      await wrapper.find(".dropdown-toggle").trigger("mousedown");
      await wrapper.find(".dropdown-toggle").trigger("click");
      await flushPromises();

      expect(wrapper.find(".autocomplete-list").exists()).toBe(false);
    });

    it("emits complete with empty query when opening via toggle", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { ...defaultProps, dropdown: true, modelValue: "existing" },
      });

      await wrapper.find(".dropdown-toggle").trigger("click");
      await flushPromises();

      const events = wrapper.emitted("complete") as Array<[{ query: string }]>;
      expect(events[events.length - 1][0].query).toBe("");
    });
  });

  describe("mouse interaction", () => {
    it("highlights item on mouseenter", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      const items = wrapper.findAll(".autocomplete-list li");
      await items[2].trigger("mouseenter");
      await flushPromises();

      expect(items[2].classes()).toContain("active");
    });
  });

  describe("blur handling", () => {
    it("closes dropdown on blur when focus leaves the component", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      const input = wrapper.find("input");
      await input.trigger("focus");
      await flushPromises();

      expect(wrapper.find(".autocomplete-list").exists()).toBe(true);

      await input.trigger("blur");
      await flushPromises();

      expect(wrapper.find(".autocomplete-list").exists()).toBe(false);
    });

    it("keeps dropdown open on blur when focus moves to a suggestion", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      const input = wrapper.find("input");
      await input.trigger("focus");
      await flushPromises();

      const listItem = wrapper.findAll(".autocomplete-list li")[0].element;

      await input.trigger("blur", { relatedTarget: listItem });
      await flushPromises();

      expect(wrapper.find(".autocomplete-list").exists()).toBe(true);
    });
  });

  describe("accessibility", () => {
    it("has combobox role on input", () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      expect(wrapper.find("input").attributes("role")).toBe("combobox");
    });

    it("has listbox role on suggestions list", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      expect(wrapper.find(".autocomplete-list").attributes("role")).toBe(
        "listbox",
      );
    });

    it("has option role on suggestion items", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      const items = wrapper.findAll(".autocomplete-list li");
      for (const item of items) {
        expect(item.attributes("role")).toBe("option");
      }
    });

    it("sets aria-expanded based on dropdown visibility", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      const input = wrapper.find("input");

      expect(input.attributes("aria-expanded")).toBe("false");

      await input.trigger("focus");
      await flushPromises();

      expect(input.attributes("aria-expanded")).toBe("true");
    });

    it("sets aria-selected on active item", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      const input = wrapper.find("input");
      await input.trigger("focus");
      await flushPromises();

      await input.trigger("keydown", { key: "ArrowDown" });
      await flushPromises();

      const items = wrapper.findAll(".autocomplete-list li");
      expect(items[0].attributes("aria-selected")).toBe("true");
      expect(items[1].attributes("aria-selected")).toBe("false");
    });

    it("sets aria-activedescendant on the input when an item is active", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { ...defaultProps, id: "test-ac" },
      });
      const input = wrapper.find("input");
      await input.trigger("focus");
      await flushPromises();

      expect(input.attributes("aria-activedescendant")).toBeUndefined();

      await input.trigger("keydown", { key: "ArrowDown" });
      await flushPromises();

      expect(input.attributes("aria-activedescendant")).toBe(
        "test-ac-listbox-option-0",
      );
    });

    it("sets aria-controls pointing to the listbox id", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { ...defaultProps, id: "test-ac" },
      });
      const input = wrapper.find("input");

      expect(input.attributes("aria-controls")).toBeUndefined();

      await input.trigger("focus");
      await flushPromises();

      expect(input.attributes("aria-controls")).toBe("test-ac-listbox");
      expect(wrapper.find(".autocomplete-list").attributes("id")).toBe(
        "test-ac-listbox",
      );
    });

    it("assigns unique ids to each option element", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { ...defaultProps, id: "test-ac" },
      });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      const items = wrapper.findAll(".autocomplete-list li");
      expect(items[0].attributes("id")).toBe("test-ac-listbox-option-0");
      expect(items[1].attributes("id")).toBe("test-ac-listbox-option-1");
      expect(items[2].attributes("id")).toBe("test-ac-listbox-option-2");
    });
  });

  describe("edge cases", () => {
    it("resets active index when suggestions change", async () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      const input = wrapper.find("input");
      await input.trigger("focus");
      await flushPromises();

      // Navigate to second item
      await input.trigger("keydown", { key: "ArrowDown" });
      await input.trigger("keydown", { key: "ArrowDown" });
      await flushPromises();

      // Update suggestions
      await wrapper.setProps({ suggestions: ["delta", "echo"] });
      await flushPromises();

      // Active index should be reset - no item should be active
      const items = wrapper.findAll(".autocomplete-list li");
      for (const item of items) {
        expect(item.classes()).not.toContain("active");
      }
    });

    it("handles empty modelValue gracefully", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { suggestions: ["a", "b"], modelValue: "" },
      });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      expect(wrapper.emitted("complete")?.[0]).toEqual([{ query: "" }]);
    });

    it("handles undefined modelValue gracefully", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { suggestions: ["a", "b"] },
      });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      expect(wrapper.emitted("complete")).toBeTruthy();
    });

    it("handles duplicate suggestions without Vue key errors", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: {
          modelValue: "",
          suggestions: ["repeat", "repeat", "unique"],
        },
      });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      const items = wrapper.findAll(".autocomplete-list li");
      expect(items).toHaveLength(3);
      expect(items[0].text()).toBe("repeat");
      expect(items[1].text()).toBe("repeat");
      expect(items[2].text()).toBe("unique");
    });
  });

  describe("id and name forwarding", () => {
    it("forwards id to the input element", () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { ...defaultProps, id: "my-input-id" },
      });
      expect(wrapper.find("input").attributes("id")).toBe("my-input-id");
    });

    it("forwards name to the input element", () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { ...defaultProps, name: "my-field-name" },
      });
      expect(wrapper.find("input").attributes("name")).toBe("my-field-name");
    });

    it("does not place id on the wrapper div", () => {
      const wrapper = mount(AutoCompleteInput, {
        props: { ...defaultProps, id: "my-input-id" },
      });
      expect(
        wrapper.find(".autocomplete-wrapper").attributes("id"),
      ).toBeUndefined();
    });
  });

  describe("aria-expanded with empty message", () => {
    it("reports aria-expanded true when empty message popup is visible", async () => {
      const wrapper = mount(AutoCompleteInput, {
        props: {
          ...defaultProps,
          suggestions: [],
          emptySearchMessage: "No results",
        },
      });
      await wrapper.find("input").trigger("focus");
      await flushPromises();

      expect(wrapper.find("input").attributes("aria-expanded")).toBe("true");
      expect(wrapper.find(".autocomplete-empty").exists()).toBe(true);
    });

    it("reports aria-expanded false when dropdown closed", () => {
      const wrapper = mount(AutoCompleteInput, { props: defaultProps });
      expect(wrapper.find("input").attributes("aria-expanded")).toBe("false");
    });
  });
});
