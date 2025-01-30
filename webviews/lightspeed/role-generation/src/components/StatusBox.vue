<script setup lang="ts">
defineProps<{ prompt: string, collectionName: string }>();
</script>

<template>
  <div id="promptContainer">
    <p>
      "<span id="prompt">{{ prompt }}</span>"&nbsp;
      <a class="backAnchor" id="backAnchorPrompt" v-on:click="$emit('restartWizard')">Edit</a>
    </p>
    <p>
      Collection name: "{{ collectionName }}"&nbsp;<a class="backAnchor" id="backAnchorCollectionName"
        v-on:click="$emit('restartWizard')">Edit</a>
    </p>
  </div>
</template>

<style scoped></style>
