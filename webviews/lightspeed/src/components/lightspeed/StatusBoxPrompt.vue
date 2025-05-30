<script setup lang="ts">
defineProps<{ prompt: string }>();
</script>

<template>
  <div>
    "<span id="prompt">{{ prompt }}</span>"&nbsp;
    <a class="backAnchor" id="backAnchorPrompt" v-on:click="$emit('restartWizard')">Edit</a>
  </div>
</template>

<style scoped></style>
