<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  title: string;
  subtitle: string;
  description?: string;
  requirementsMet?: boolean;
}>();

const isDisabled = computed(() => props.requirementsMet === false);
</script>

<template>
  <body>
    <slot name="banner"></slot>
    <div :class="{ 'disabled-content': isDisabled }">
      <div :class="description ? 'title-description-div' : 'title-div'">
        <h1>{{ title }}</h1>
        <p class="subtitle">{{ subtitle }}</p>
      </div>

      <div v-if="description" class="description-div">
        <h3 v-html="description"></h3>
      </div>

      <slot></slot>
    </div>
  </body>
</template>

<style>
/* Base form layout styles */
body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.title-div {
  box-sizing: border-box;
  display: flex;
  flex-flow: column nowrap;
  width: 100%;
  max-width: 650px;
  text-align: left;
  margin: 25px 0px 50px;
}

.title-description-div {
  box-sizing: border-box;
  display: flex;
  flex-flow: column nowrap;
  width: 100%;
  max-width: 650px;
  text-align: left;
  margin: 25px 0px 40px;
}

h1 {
  border: none;
  font-size: 2.7em;
  font-weight: 400;
  margin: 0;
  color: var(--vscode-foreground);
  white-space: nowrap;
}

h3 {
  border: none;
  font-size: 1.1em;
  font-style: normal;
  font-weight: normal;
  margin: 0;
  color: var(--vscode-foreground);
  white-space: wrap;
}

.subtitle {
  color: var(--vscode-descriptionForeground);
  line-height: 1.4em;
  display: block;
  font-size: 2em;
  margin: 0px;
}

.description-div {
  box-sizing: border-box;
  display: flex;
  flex-flow: column nowrap;
  width: 100%;
  max-width: 650px;
  text-align: left;
  margin: 0px 0px 40px;
}

section {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin-bottom: 20px;
  max-width: 650px;
}

.container {
  display: flex;
  flex-direction: column;
  font-size: 1em;
}

.element {
  margin-bottom: 14px;
}

/* Form element styles */
vscode-textfield {
  margin-bottom: 6px;
  width: 100%;
}

vscode-textarea {
  margin-top: 6px;
  margin-bottom: 6px;
}

vscode-form-group {
  width: 100%;
  margin: 0;
}

vscode-divider {
  width: 100%;
}

vscode-button {
  margin: 0px 3px;
}

vscode-single-select {
  width: 200px;
}

vscode-checkbox i {
  color: var(--vscode-descriptionForeground);
  font-size: small;
}

/* Common layout classes */
.checkbox-div {
  display: flex;
  flex-direction: column;
  margin-top: 10px;
  margin-bottom: 10px;
  width: 100%;
}

.verbose-div {
  display: flex;
  flex-direction: row;
  margin-top: 12px;
  margin-bottom: 30px;
  width: 100%;
}

.image-div {
  display: flex;
  flex-direction: row;
  margin-top: 12px;
  margin-bottom: 30px;
  width: 100%;
}

.group-buttons {
  display: flex;
  flex-direction: row;
}

.dropdown-container {
  box-sizing: border-box;
  display: flex;
  flex-flow: column nowrap;
  align-items: flex-start;
  justify-content: flex-start;
}

.dropdown-container label {
  display: block;
  color: var(--vscode-foreground);
  cursor: pointer;
  font-size: var(--vscode-font-size);
  line-height: normal;
  margin-bottom: 2px;
}

.required-fields {
  margin-top: 10px;
  color: var(--vscode-descriptionForeground);
}

#vscode-logs-label {
  padding: 0;
  align-self: flex-start;
  margin-left: 5px;
}

#log-text-area {
  width: 100%;
  max-width: 100%;
  height: 156px;
  resize: vertical;
}

.disabled-content {
  opacity: 0.4;
  pointer-events: none;
}
</style>
