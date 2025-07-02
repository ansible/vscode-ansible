<template>
  <div class="requirements-banner-welcome">
    <span class="codicon codicon-warning banner-icon"></span>
    <div class="banner-content">
      <div class="banner-title">Requirements Not Met</div>
      <div class="banner-message">
        <template v-if="failures.length === 1 && failures[0].type === 'ansible-creator'">
          This feature requires ansible-creator version <b>{{ failures[0].required }}</b> or higher. Please upgrade to this version to use this feature.
        </template>
        <template v-else>
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ failures: Array<{ type: string; required: string; current: string }> }>();
</script>

<style scoped>
.requirements-banner-welcome {
  display: flex;
  align-items: flex-start;
  background: var(--vscode-welcomePage-tileBackground, #f3f3f3);
  border-left: 4px solid var(--vscode-inputValidation-warningBorder, #e0c200);
  border-radius: 6px;
  padding: 18px 20px;
  margin-bottom: 20px;
  box-shadow: 0 1px 4px 0 rgba(0,0,0,0.04);
  gap: 18px;
}
.banner-icon {
  font-size: 2em;
  color: var(--vscode-inputValidation-warningBorder, #e0c200);
  margin-top: 2px;
}
.banner-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.banner-title {
  font-size: 1.2em;
  font-weight: 600;
  color: var(--vscode-foreground, #333);
  margin-bottom: 2px;
}
.banner-message {
  color: var(--vscode-descriptionForeground, #666);
  font-size: 1em;
}
.banner-message ul {
  margin: 0 0 0 1.2em;
  padding: 0;
}
</style>
