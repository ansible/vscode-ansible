<template>
  <div class="requirements-banner">
    <span class="codicon codicon-warning"></span>
    <span>
      <template v-if="failures.length === 1 && failures[0].type === 'ansible-creator'">
        This feature requires ansible-creator version <b>{{ failures[0].required }}</b> or higher. Please upgrade to this version to use this feature.
      </template>
      <template v-else>
        <b>Some requirements are not met:</b>
        <ul>
          <li v-for="failure in failures" :key="failure.type">
            <span v-if="failure.type === 'ansible-creator'">
              ansible-creator version <b>{{ failure.required }}</b> required (found: <b>{{ failure.current }}</b>)
            </span>
            <span v-else>
              {{ failure.type }}: required <b>{{ failure.required }}</b> (found: <b>{{ failure.current }}</b>)
            </span>
          </li>
        </ul>
        Please upgrade or install the required tools to use this feature.
      </template>
    </span>
  </div>
</template>

<script setup lang="ts">
defineProps<{ failures: Array<{ type: string; required: string; current: string }> }>();
</script>

<style scoped>
.requirements-banner {
  background-color: var(--vscode-inputValidation-warningBackground, #fffbe6);
  border: 1px solid var(--vscode-inputValidation-warningBorder, #e0c200);
  color: var(--vscode-inputValidation-warningForeground, #8a6d3b);
  border-radius: 4px;
  padding: 12px 16px;
  margin-bottom: 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 1em;
}
.requirements-banner ul {
  margin: 0 0 0 1.2em;
  padding: 0;
}
.requirements-banner .codicon {
  font-size: 1.5em;
  margin-right: 8px;
  color: var(--vscode-inputValidation-warningForeground, #8a6d3b);
}
</style> 