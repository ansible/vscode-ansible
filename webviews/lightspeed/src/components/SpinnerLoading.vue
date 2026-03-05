<script setup lang="ts">
import '@vscode/codicons/dist/codicon.css';

defineProps<{
  message?: string;
}>();
</script>

<template>
  <div class="loading">
    <span class="codicon codicon-loading codicon-modifier-spin"></span>
    {{ message || 'Loading...' }}
  </div>
</template>

<style scoped>
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 20px;
  color: var(--vscode-descriptionForeground);
}

.codicon-modifier-spin {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}
</style>
