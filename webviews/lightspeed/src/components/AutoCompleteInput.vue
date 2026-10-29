<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";

const props = withDefaults(
  defineProps<{
    id?: string;
    name?: string;
    suggestions: string[];
    placeholder?: string;
    showEmptyMessage?: boolean;
    emptySearchMessage?: string;
    dropdown?: boolean;
  }>(),
  {
    showEmptyMessage: true,
  },
);

defineOptions({ inheritAttrs: false });

const emit = defineEmits<{
  complete: [event: { query: string }];
}>();

const modelValue = defineModel<string>({ default: "" });

const showDropdown = ref(false);
const activeIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);
const toggleRef = ref<HTMLButtonElement | null>(null);
const listRef = ref<HTMLUListElement | null>(null);
const popupRef = ref<HTMLElement | null>(null);

const listboxId = computed(() =>
  props.id ? `${props.id}-listbox` : "autocomplete-listbox",
);
const activeDescendantId = computed(() =>
  activeIndex.value >= 0 ? `${listboxId.value}-option-${activeIndex.value}` : undefined,
);

const isPopupVisible = computed(
  () =>
    showDropdown.value &&
    (props.suggestions.length > 0 ||
      (props.showEmptyMessage && !!props.emptySearchMessage)),
);

function onInput(event: Event) {
  showDropdown.value = true;
  activeIndex.value = -1;
  emit("complete", { query: (event.target as HTMLInputElement).value });
}

function onFocus() {
  showDropdown.value = true;
  emit("complete", { query: modelValue.value ?? "" });
}

function selectItem(item: string) {
  modelValue.value = item;
  showDropdown.value = false;
  activeIndex.value = -1;
}

function onOptionKeydown(event: KeyboardEvent, item: string) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    selectItem(item);
  }
}

function isRelatedToPopup(related: Node | null): boolean {
  if (!related) return false;
  return (
    (toggleRef.value?.contains(related) ?? false) ||
    related === toggleRef.value ||
    (listRef.value?.contains(related) ?? false) ||
    (popupRef.value?.contains(related) ?? false)
  );
}

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;

  if (!showDropdown.value || props.suggestions.length === 0) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      showDropdown.value = true;
      emit("complete", { query: modelValue.value ?? "" });
    } else if (event.key === "Escape") {
      showDropdown.value = false;
      activeIndex.value = -1;
    }
    return;
  }

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      activeIndex.value =
        activeIndex.value < props.suggestions.length - 1
          ? activeIndex.value + 1
          : 0;
      scrollToActive();
      break;
    case "ArrowUp":
      event.preventDefault();
      activeIndex.value =
        activeIndex.value > 0
          ? activeIndex.value - 1
          : props.suggestions.length - 1;
      scrollToActive();
      break;
    case "Enter":
      event.preventDefault();
      if (activeIndex.value >= 0) {
        selectItem(props.suggestions[activeIndex.value]);
      }
      break;
    case "Escape":
      showDropdown.value = false;
      activeIndex.value = -1;
      break;
  }
}

function scrollToActive() {
  nextTick(() => {
    const list = listRef.value;
    if (!list) return;
    const active = list.querySelector(".active") as HTMLElement;
    if (active?.scrollIntoView) {
      active.scrollIntoView({ block: "nearest" });
    }
  });
}

function toggleDropdown() {
  showDropdown.value = !showDropdown.value;
  if (showDropdown.value) {
    inputRef.value?.focus();
    emit("complete", { query: "" });
  }
}

watch(
  () => props.suggestions,
  () => {
    activeIndex.value = -1;
  },
);
</script>

<template>
  <div class="autocomplete-wrapper">
    <div class="autocomplete-input-group">
      <input
        ref="inputRef"
        :id="id"
        :name="name"
        type="text"
        class="autocomplete-input"
        :placeholder="placeholder"
        v-model="modelValue"
        @input="onInput"
        @focus="onFocus"
        @keydown="onKeydown"
        @blur="
          (e) => {
            const related = e.relatedTarget as Node | null;
            if (!isRelatedToPopup(related)) {
              showDropdown = false;
              activeIndex = -1;
            }
          }
        "
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="isPopupVisible"
        aria-haspopup="listbox"
        :aria-controls="isPopupVisible ? listboxId : undefined"
        :aria-activedescendant="activeDescendantId"
      />
      <button
        v-if="dropdown"
        ref="toggleRef"
        class="dropdown-toggle"
        @mousedown.prevent
        @click.prevent="toggleDropdown"
        tabindex="-1"
        aria-label="Toggle suggestions"
        :aria-expanded="isPopupVisible"
      >
        <span class="toggle-icon">▾</span>
      </button>
    </div>
    <ul
      v-if="showDropdown && suggestions.length > 0"
      ref="listRef"
      :id="listboxId"
      class="autocomplete-list"
      role="listbox"
      @mousedown.prevent
    >
      <li
        v-for="(item, index) in suggestions"
        :key="`${index}-${item}`"
        :id="`${listboxId}-option-${index}`"
        :class="{ active: index === activeIndex }"
        role="option"
        :aria-selected="index === activeIndex"
        @click="selectItem(item)"
        @keydown="(event) => onOptionKeydown(event, item)"
        @mouseenter="activeIndex = index"
      >
        {{ item }}
      </li>
    </ul>
    <div
      v-else-if="
        showDropdown &&
        suggestions.length === 0 &&
        showEmptyMessage !== false &&
        emptySearchMessage
      "
      ref="popupRef"
      class="autocomplete-empty"
      @mousedown.prevent
    >
      {{ emptySearchMessage }}
    </div>
  </div>
</template>

<style scoped>
.autocomplete-wrapper {
  position: relative;
  width: 100%;
}

.autocomplete-input-group {
  display: flex;
  align-items: stretch;
}

.autocomplete-input {
  flex: 1;
  padding: 4px 8px;
  font-size: var(--vscode-font-size);
  font-family: var(--vscode-font-family);
  color: var(--vscode-input-foreground);
  background-color: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border, var(--vscode-checkbox-selectBorder));
  border-radius: 2px;
  outline: none;
  box-sizing: border-box;
}

.autocomplete-input:focus {
  border-color: var(--vscode-focusBorder);
}

.dropdown-toggle {
  padding: 4px 8px;
  background-color: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border, var(--vscode-checkbox-selectBorder));
  border-left: none;
  border-radius: 0 2px 2px 0;
  color: var(--vscode-input-foreground);
  cursor: pointer;
  display: flex;
  align-items: center;
}

.dropdown-toggle:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.toggle-icon {
  font-size: 10px;
}

.autocomplete-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
  background-color: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 2px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
}

.autocomplete-list li {
  padding: 4px 8px;
  cursor: pointer;
  color: var(--vscode-dropdown-foreground);
}

.autocomplete-list li:hover,
.autocomplete-list li.active {
  background-color: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.autocomplete-empty {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin: 2px 0 0;
  padding: 8px;
  background-color: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 2px;
  color: var(--vscode-descriptionForeground);
  font-style: italic;
  z-index: 1000;
}
</style>
