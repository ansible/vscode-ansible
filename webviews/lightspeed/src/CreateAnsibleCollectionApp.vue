<script setup lang="ts">
import { allComponents, provideVSCodeDesignSystem } from '@vscode/webview-ui-toolkit';

provideVSCodeDesignSystem().register(allComponents);

</script>

<template>
  <h2 id="main-header">Create a collection!</h2>
</template>

<style scoped></style>
