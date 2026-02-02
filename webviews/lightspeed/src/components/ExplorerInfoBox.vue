<script setup lang="ts">
defineProps<{
  provider: string;
  userContent: string;
}>();
</script>

<template>
  <p v-if="userContent && provider == 'wca'" v-html="userContent">
  </p>
  <p v-else>Using {{ provider }} provider
  </p>
</template>

<style scoped>
p {
  margin-bottom: 1rem;
  font-size: 0.9rem;
}
</style>
