<script setup lang="ts">
import ErrorBoxEntry from "./ErrorBoxEntry.vue";

const errorMessages = defineModel<string[]>("errorMessages", {
  required: true,
});

function dismiss() {
  errorMessages.value = [];
}
</script>

<template>
  <div class="error-banner" v-if="errorMessages.length > 0" role="alert">
    <div class="error-header">
      <span class="codicon codicon-error"></span>
      <strong>Something went wrong</strong>
      <button class="dismiss-btn" @click="dismiss" title="Dismiss">
        <span class="codicon codicon-close"></span>
      </button>
    </div>
    <ul class="error-list">
      <ErrorBoxEntry v-for="(message, idx) in errorMessages" :key="idx" :message />
    </ul>
  </div>
</template>

<style scoped>
.error-banner {
  margin: 12px 0;
  border-radius: 4px;
  border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
  background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
  overflow: hidden;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.15);
}

.error-header .codicon-error {
  color: var(--vscode-errorForeground, #f48771);
  font-size: 16px;
}

.error-header strong {
  flex: 1;
  font-size: 0.9em;
  color: var(--vscode-errorForeground, #f48771);
}

.dismiss-btn {
  background: none;
  border: none;
  color: var(--vscode-foreground);
  cursor: pointer;
  padding: 2px;
  opacity: 0.7;
}

.dismiss-btn:hover {
  opacity: 1;
}

.error-list {
  list-style: none;
  margin: 0;
  padding: 8px 12px 10px 36px;
}
</style>
