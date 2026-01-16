<script setup lang="ts">
defineProps<{
  message?: string;
}>();
</script>

<template>
  <div class="loading">
    <p>{{ message || 'Loading...' }}</p>
  </div>
</template>

<style scoped>
.loading {
  text-align: center;
  padding: 2rem;
}
</style>
