<script setup lang="ts">
defineProps<{
  provider: string;
  userContent: string;
}>();
</script>

<template>
  <p v-if="userContent" class="user-content" v-html="userContent">
  </p>
  <p v-else>Using {{ provider }} provider
  </p>
</template>

<style scoped>
p.user-content {
  margin-bottom: 1rem;
  font-size: 0.9rem;
}
</style>
