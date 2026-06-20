<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
  <li class="error-entry">{{ message }}</li>
</template>

<style scoped>
.error-entry {
  color: var(--vscode-foreground);
  font-size: 0.9em;
  line-height: 1.5;
  padding: 2px 0;
}

.error-entry + .error-entry {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin-top: 4px;
  padding-top: 6px;
}
</style>
