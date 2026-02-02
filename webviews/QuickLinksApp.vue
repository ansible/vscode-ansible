<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { vscodeApi } from './lightspeed/src/utils';
import '../media/quickLinks/quickLinksStyle.css';

// State
const systemReadinessIcon = ref('');
const systemReadinessDescription = ref('');
const showSystemReadiness = ref(false);

// Active provider state
const activeProviderName = ref('');
const isProviderConnected = ref(false);

// System status check
const updateAnsibleCreatorAvailabilityStatus = () => {
  vscodeApi.postMessage({
    message: 'set-system-status-view',
  });
};

// Get active provider info
const getActiveProviderInfo = () => {
  vscodeApi.postMessage({
    command: 'getActiveProvider',
  });
};

// Message handler
const handleMessage = (event: MessageEvent) => {
  const message = event.data;
  if (message.command === 'systemDetails') {
    const systemDetails = message.arguments;
    const ansibleVersion = systemDetails['ansible version'];
    const pythonVersion = systemDetails['python version'];
    const ansibleCreatorVersion = systemDetails['ansible-creator version'];

    const systemStatus = !!(
      ansibleVersion &&
      pythonVersion &&
      ansibleCreatorVersion
    );

    if (!systemStatus) {
      systemReadinessIcon.value = 'codicon-warning';
      systemReadinessDescription.value = `
        <p class="system-description">
          <b>Looks like you don't have an Ansible environment set up yet</b>.
          <br>
          <br>
            <a href="command:ansible.content-creator.create-devcontainer">
              Create a devcontainer
            </a> to build your environment using the
            <a href="https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers">
             Dev Containers
             </a> extension, or follow the
            <a href="command:ansible.open-walkthrough-create-env">
              Create an Ansible environment
            </a> walkthrough to get started.
        </p>`;
      showSystemReadiness.value = true;
    }
  } else if (message.command === 'activeProviderInfo') {
    activeProviderName.value = message.providerDisplayName || '';
    isProviderConnected.value = message.isConnected || false;
  }
};

onMounted(() => {
  updateAnsibleCreatorAvailabilityStatus();
  getActiveProviderInfo();
  window.addEventListener('message', handleMessage);
});
</script>

<template>
  <div id="quickLinksView">
    <div v-if="showSystemReadiness" id="system-readiness" class="statusDisplay">
      <section>
        <span class="codicon" :class="systemReadinessIcon"></span>
      </section>
      <section v-html="systemReadinessDescription"></section>
    </div>

    <div class="index-list start-container">
      <h3>LAUNCH</h3>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.content-creator.menu" title="Ansible Development Tools welcome page">
            <span class="codicon codicon-rocket"></span> Getting Started
          </a>
        </h3>
      </div>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.mcpServer.enabled" title="Activate Ansible Development Tools MCP Server for AI assistants">
            <span class="codicon codicon-wand"></span> Activate MCP Server (AI)
            <span class="new-badge">NEW</span>
          </a>
        </h3>
      </div>
      <div class="catalogue">
        <h3>
          <a href="https://docs.redhat.com/en/documentation/red_hat_ansible_lightspeed_with_ibm_watsonx_code_assistant/2.x_latest/html-single/red_hat_ansible_lightspeed_with_ibm_watsonx_code_assistant_user_guide/index#using-code-bot-for-suggestions_lightspeed-user-guide" title="Ansible code bot documentation">
            <span class="codicon codicon-rocket"></span> Ansible code bot
          </a>
        </h3>
      </div>
      <div class="catalogue">
        <h3>
          <a href="https://docs.ansible.com/projects/dev-tools/" title="Ansible Development Tools documentation">
            <span class="codicon codicon-rocket"></span> Documentation
          </a>
        </h3>
      </div>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.extension-settings.open" title="Ansible extension settings">
            <span class="codicon codicon-settings-gear"></span> Settings
          </a>
        </h3>
      </div>

      <h3>GENERATIVE AI</h3>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.lightspeed.openLlmProviderSettings" title="Configure LLM provider for Ansible Lightspeed">
            <span class="codicon codicon-settings-gear"></span> LLM Provider
            <span v-if="activeProviderName && isProviderConnected" class="active-provider-badge connected">
              : {{ activeProviderName }}
            </span>
          </a>
        </h3>
      </div>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.lightspeed.playbookGeneration" title="Generate a playbook with Ansible Lightspeed">
            <span class="codicon codicon-sparkle"></span> Generate Playbook
          </a>
        </h3>
      </div>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.lightspeed.playbookExplanation" title="Explain the current playbook">
            <span class="codicon codicon-sparkle"></span> Explain Playbook
          </a>
        </h3>
      </div>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.lightspeed.roleGeneration" title="Generate a role with Ansible Lightspeed">
            <span class="codicon codicon-sparkle"></span> Generate Role
          </a>
        </h3>
      </div>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.lightspeed.roleExplanation" title="Explain the current role">
            <span class="codicon codicon-sparkle"></span> Explain Role
          </a>
        </h3>
      </div>

      <h3>INITIALIZE</h3>
      <p>Initialize a new Ansible project</p>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.content-creator.create-ansible-collection" title="Create a collection project">
            <span class="codicon codicon-new-file"></span> Collection project
          </a>
        </h3>
      </div>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.content-creator.create-execution-env-file" title="Create an execution environment project">
            <span class="codicon codicon-new-file"></span> Execution environment project
            <span class="new-badge">NEW</span>
          </a>
        </h3>
      </div>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.content-creator.create-ansible-project" title="Create a playbook project">
            <span class="codicon codicon-new-file"></span> Playbook project
          </a>
        </h3>
      </div>

      <h3>ADD</h3>
      <p>Add resources to an existing Ansible project</p>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.content-creator.add-plugin" title="Add a plugin to an existing collection">
            <span class="codicon codicon-new-file"></span> Collection plugin
            <span class="new-badge">NEW</span>
          </a>
        </h3>
      </div>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.content-creator.create-devcontainer" title="Create a devcontainer and add it to an existing Ansible project">
            <span class="codicon codicon-new-file"></span> Devcontainer
            <span class="new-badge">NEW</span>
          </a>
        </h3>
      </div>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.content-creator.create-devfile" title="Create a devfile and add it to an existing Ansible project">
            <span class="codicon codicon-new-file"></span> Devfile
            <span class="new-badge">NEW</span>
          </a>
        </h3>
      </div>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.content-creator.create-role" title="Create a role and add it to an existing Ansible collection">
            <span class="codicon codicon-new-file"></span> Role
            <span class="new-badge">NEW</span>
          </a>
        </h3>
      </div>
      <div class="catalogue">
        <h3>
          <a href="command:ansible.create-empty-playbook" title="Create a playbook template">
            <span class="codicon codicon-new-file"></span> Playbook template
          </a>
        </h3>
      </div>
    </div>
  </div>
</template>
