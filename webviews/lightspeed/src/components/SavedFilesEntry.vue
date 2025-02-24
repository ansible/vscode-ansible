<script setup lang="ts">
const props = defineProps<{
  longPath: string,
  command: string,
}>();
</script>

<template>
  <li><a :href="command">{{ longPath }}</a></li>
</template>

<style scoped></style>
