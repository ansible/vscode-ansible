<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
    <li><span class="codicon codicon-warning"></span>{{ message }}</li>
</template>

<style scoped>
li {
    color: var(--vscode-errorForeground);
    font-weight: bold;
}
</style>
