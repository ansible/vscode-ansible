<script setup lang="ts">
const emit = defineEmits<{
  connect: [];
}>();

const handleConnect = () => {
  emit('connect');
};
</script>

<template>
  <div class="login-form">
    <p>Experience smarter automation using Ansible Lightspeed with watsonx Code Assistant solutions for your playbook.
      <a href="https://www.redhat.com/en/engage/project-wisdom" target="_blank">Learn more</a>
    </p>
    <div class="button-container">
      <vscode-button @click="handleConnect" id="lightspeed-explorer-connect" class="lightspeedExplorerButton">
        Connect
      </vscode-button>
    </div>
  </div>
</template>

<style scoped>
.login-form {
  padding: 1rem 0;
}

.login-form p {
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.login-form a {
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
}

.login-form a:hover {
  text-decoration: underline;
}

.button-container {
  margin-bottom: 0.75rem;
  display: flex;
  flex-direction: column;
}

.lightspeedExplorerButton {
  width: 100%;
  padding: 0.5rem;
}
</style>
