<script setup lang="ts">
import "@vscode/codicons/dist/codicon.css";
</script>

<template>
  <div class="spinner-container" role="progressbar" aria-label="Loading">
    <span class="codicon codicon-loading codicon-modifier-spin"></span>
  </div>
</template>

<style scoped>
.spinner-container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.codicon-modifier-spin {
  font-size: 24px;
  color: var(--vscode-progressBar-background);
}
</style>
