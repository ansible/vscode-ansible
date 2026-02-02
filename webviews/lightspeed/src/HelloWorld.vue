<script setup lang="ts">
import '@vscode/codicons/dist/codicon.css';
import { ref, watch } from 'vue';
import type { Ref } from 'vue'

import ErrorBox from './components/ErrorBox.vue';

const errorMessages: Ref<string[]> = ref([])



errorMessages.value.push("An error message example to demonstrate how to use the ErrorBox component!");

</script>

<template>
  <h1 id="main-header">Hello World</h1>

  <ErrorBox v-model:error-messages="errorMessages" />

  <vscode-button @click="errorMessages = []">Clear Errors</vscode-button>
</template>
<style scoped></style>
