<script setup lang="ts">
import '@vscode/codicons/dist/codicon.css';

defineProps<{
  visible: boolean;
  message: string;
}>();
</script>

<template>
  <div :class="['toast-notification', { visible }]">
    <span class="codicon codicon-check"></span> {{ message }}
  </div>
</template>

<style scoped>
.toast-notification {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background-color: var(--vscode-charts-green);
  color: var(--vscode-editor-background);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
}

.toast-notification.visible {
  opacity: 1;
  transform: translateY(0);
}
</style>
