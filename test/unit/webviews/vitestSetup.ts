import { vi } from "vitest";
import { config } from "@vue/test-utils";

// Mock the vscodeApi
vi.mock("../../../webviews/lightspeed/src/utils/vscode", () => ({
  vscodeApi: {
    post: vi.fn(),
    on: vi.fn(),
    postAndReceive: vi.fn().mockResolvedValue([]),
  },
}));

// Mock uuid
vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-uuid-1234"),
}));

// Mock marked
vi.mock("marked", () => ({
  parse: vi.fn((text: string) => `<p>${text}</p>`),
  parseInline: vi.fn((text: string) => text),
}));

// Mock PrimeVue
vi.mock("primevue/autocomplete", () => ({
  default: {
    name: "AutoComplete",
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" :placeholder="placeholder" />',
    props: [
      "modelValue",
      "suggestions",
      "placeholder",
      "fluid",
      "size",
      "showEmptyMessage",
      "dropdown",
      "name",
      "emptySearchMessage",
    ],
    emits: ["update:modelValue", "complete"],
  },
}));

// Mock highlight.js
vi.mock("highlight.js/styles/atom-one-dark.css", () => ({}));

// Configure Vue Test Utils to stub vscode-* custom elements
config.global.stubs = {
  "vscode-button": {
    template:
      '<button :disabled="disabled" :title="title"><slot /></button>',
    props: ["disabled", "title"],
  },
  "vscode-textfield": {
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue"],
    emits: ["update:modelValue"],
  },
  ProgressSpinner: {
    template: '<div class="progress-spinner">Loading...</div>',
  },
  highlightjs: {
    template: '<pre><code>{{ code }}</code></pre>',
    props: ["language", "autodetect", "code"],
  },
};
