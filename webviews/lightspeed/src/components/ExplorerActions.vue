<script setup lang="ts">
defineProps<{
  userContent: string;
  hasPlaybookOpened: boolean;
  hasRoleOpened: boolean;
}>();

const emit = defineEmits<{
  generatePlaybook: [];
  explainPlaybook: [];
  generateRole: [];
  explainRole: [];
}>();
</script>

<template>
  <div class="active-session">
    <p v-if="userContent" class="user-content" v-html="userContent">
    </p>

    <div class="button-container">
      <vscode-button @click="emit('generatePlaybook')" id="lightspeed-explorer-playbook-generation-submit"
        class="lightspeedExplorerButton">
        Generate a playbook
      </vscode-button>
    </div>

    <div class="button-container">
      <vscode-button @click="emit('explainPlaybook')" id="lightspeed-explorer-playbook-explanation-submit"
        class="lightspeedExplorerButton" :disabled="!hasPlaybookOpened"
        :title="!hasPlaybookOpened ? 'The file in the active editor view is not an Ansible playbook' : ''">
        Explain the current playbook
      </vscode-button>
    </div>

    <div class="button-container">
      <vscode-button @click="emit('generateRole')" id="lightspeed-explorer-role-generation-submit"
        class="lightspeedExplorerButton">
        Generate a role
      </vscode-button>
    </div>

    <div class="button-container">
      <vscode-button @click="emit('explainRole')" id="lightspeed-explorer-role-explanation-submit"
        class="lightspeedExplorerButton" :disabled="!hasRoleOpened"
        :title="!hasRoleOpened ? 'The file in the active editor view is not part of an Ansible role' : ''">
        Explain the current role
      </vscode-button>
    </div>
  </div>
</template>

<style scoped>
.active-session p.user-content {
  margin-bottom: 1rem;
  font-size: 0.9rem;
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

.lightspeedExplorerButton:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
