<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
    <li><span class="codicon codicon-warning errorMessage"></span><strong>{{ message }}</strong></li>
</template>

<style scoped>
.errorMessage {
    color: red;
    font-weight: bold;
}
</style>
