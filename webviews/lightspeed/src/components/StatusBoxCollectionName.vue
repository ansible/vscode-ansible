<script setup lang="ts">
defineProps<{ collectionName: string }>();
</script>

<template>
  <div>
    Collection name: "{{ collectionName }}"&nbsp;<a class="backAnchor" id="backAnchorCollectionName"
      v-on:click="$emit('restartWizard')">Edit</a>
  </div>
</template>

<style scoped></style>
