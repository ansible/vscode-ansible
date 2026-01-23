<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { Ref } from 'vue'
import { vscodeApi } from './utils';
import * as marked from "marked";

import ErrorBox from './components/ErrorBox.vue';
import LoadingState from './components/LoadingState.vue';
import LoginPrompt from './components/LoginPrompt.vue';
import ExplorerActions from './components/ExplorerActions.vue';
import ExplorerInfoBox from './components/ExplorerInfoBox.vue';

const errorMessages: Ref<string[]> = ref([])
const provider = ref('wca');

// WCA Only
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
  provider.value = data.provider || '';

  // WCA Only
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

    <LoadingState v-if="loading" />

    <LoginPrompt v-else-if="provider == 'wca' && !isAuthenticated" @connect="handleConnect" />

    <template v-else>
      <ExplorerInfoBox :provider="provider" :user-content="userContent" />
      <ExplorerActions :has-playbook-opened="hasPlaybookOpened" :has-role-opened="hasRoleOpened"
        @generate-playbook="handleGeneratePlaybook" @explain-playbook="handleExplainPlaybook"
        @generate-role="handleGenerateRole" @explain-role="handleExplainRole" />
    </template>
  </div>
</template>

<style scoped>
#explorer-container {
  padding: 1rem;
}
</style>
