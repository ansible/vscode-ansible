<script setup lang="ts">
import "highlight.js/styles/atom-one-dark.css";

import { GenerationListEntry } from "../../../../../src/interfaces/lightspeed";
defineProps<{ file: GenerationListEntry }>();
</script>

<template>
  <li>
    {{ file.path }}
    <highlightjs language="yaml" :autodetect="false" :code="file.content" />
  </li>
</template>

<style scoped></style>
