<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Ref } from 'vue'
import { allComponents, provideVSCodeDesignSystem } from '@vscode/webview-ui-toolkit';

import ErrorBox from './components/ErrorBox.vue';

const errorMessages: Ref<string[]> = ref([])


provideVSCodeDesignSystem().register(allComponents);

errorMessages.value.push("An error message example to demonstrate how to use the ErrorBox component!");

</script>

<template>
  <h1 id="main-header">Hello World</h1>

  <ErrorBox v-model:error-messages="errorMessages" />

</template>
<style scoped></style>
