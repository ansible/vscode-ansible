<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { Ref } from 'vue'
import { vscodeApi } from './utils';
import { allComponents, provideVSCodeDesignSystem } from '@vscode/webview-ui-toolkit';
import * as marked from "marked";

import ErrorBox from './components/ErrorBox.vue';

provideVSCodeDesignSystem().register(allComponents);

const errorMessages: Ref<string[]> = ref([])
const isAuthenticated = ref(false);
const userContent = ref('');
const hasPlaybookOpened = ref(false);
const hasRoleOpened = ref(false);
const loading = ref(true);

onMounted(async () => {
  // Request initial state from extension
  vscodeApi.post('getExplorerState', {});
});

// Listen for state updates from extension
vscodeApi.on('userRefreshExplorerState', (data: any) => {
  vscodeApi.post('getExplorerState', {});
});


// Listen for state updates from extension
vscodeApi.on('explorerStateUpdate', (data: any) => {
  console.log("Received explorerStateUpdate:", data);
  isAuthenticated.value = data.isAuthenticated || false;
  userContent.value = marked.parseInline(data.userContent || '') as string;
  hasPlaybookOpened.value = data.hasPlaybookOpened || false;
  hasRoleOpened.value = data.hasRoleOpened || false;
  loading.value = false;
});

// Handle messages for state changes
vscodeApi.on('playbookOpenedStateChanged', (data: any) => {
  hasPlaybookOpened.value = data.hasPlaybookOpened || false;
});

vscodeApi.on('roleOpenedStateChanged', (data: any) => {
  hasRoleOpened.value = data.hasRoleOpened || false;
});

// Button handlers
const handleConnect = () => {
  vscodeApi.post('explorerConnect', {});
};

const handleGeneratePlaybook = () => {
  vscodeApi.post('explorerGeneratePlaybook', {});
};

const handleExplainPlaybook = () => {
  vscodeApi.post('explorerExplainPlaybook', {});
};

const handleGenerateRole = () => {
  vscodeApi.post('explorerGenerateRole', {});
};

const handleExplainRole = () => {
  vscodeApi.post('explorerExplainRole', {});
};

</script>

<template>
  <div id="explorer-container">
    <ErrorBox v-model:error-messages="errorMessages" />

    <div v-if="loading" class="loading">
      <p>Loading...</p>
    </div>

    <div v-else-if="!isAuthenticated" class="login-form">
      <p>Experience smarter automation using Ansible Lightspeed with watsonx Code Assistant solutions for your playbook.
        <a href="https://www.redhat.com/en/engage/project-wisdom" target="_blank">Learn more</a>
      </p>
      <div class="button-container">
        <vscode-button @click="handleConnect" id="lightspeed-explorer-connect" class="lightspeedExplorerButton">
          Connect
        </vscode-button>
      </div>
    </div>

    <div v-else class="active-session">
      <p v-if="userContent" class="user-content" v-html="userContent">
      </p>

      <div class="button-container">
        <vscode-button @click="handleGeneratePlaybook" id="lightspeed-explorer-playbook-generation-submit"
          class="lightspeedExplorerButton">
          Generate a playbook
        </vscode-button>
      </div>

      <div class="button-container">
        <vscode-button @click="handleExplainPlaybook" id="lightspeed-explorer-playbook-explanation-submit"
          class="lightspeedExplorerButton" :disabled="!hasPlaybookOpened"
          :title="!hasPlaybookOpened ? 'The file in the active editor view is not an Ansible playbook' : ''">
          Explain the current playbook
        </vscode-button>
      </div>

      <div class="button-container">
        <vscode-button @click="handleGenerateRole" id="lightspeed-explorer-role-generation-submit"
          class="lightspeedExplorerButton">
          Generate a role
        </vscode-button>
      </div>

      <div class="button-container">
        <vscode-button @click="handleExplainRole" id="lightspeed-explorer-role-explanation-submit"
          class="lightspeedExplorerButton" :disabled="!hasRoleOpened"
          :title="!hasRoleOpened ? 'The file in the active editor view is not part of an Ansible role' : ''">
          Explain the current role
        </vscode-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
#explorer-container {
  padding: 1rem;
}

.loading {
  text-align: center;
  padding: 2rem;
}

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
