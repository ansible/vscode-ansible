<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { vscodeApi } from './lightspeed/src/utils';
import '../media/welcomePage/style.css';
import '../media/contentCreator/welcomePageStyle.css';

// State management
const systemReadinessStatus = ref('');
const systemReadinessIcon = ref('');
const systemReadinessDescription = ref('');
interface Walkthrough {
  id: string;
  title: string;
  description: string;
  icon?: string;
}

const walkthroughs = ref<Walkthrough[]>([]);
const isLoading = ref(true);
const logoUrl = ref('');

// System status details
const ansibleVersionStatus = ref('');
const ansibleLocationStatus = ref('');
const pythonVersionStatus = ref('');
const pythonLocationStatus = ref('');
const ansibleCreatorVersionStatus = ref('');
const ansibleDevEnvironmentStatus = ref('');

// Computed properties
const hasSystemStatus = computed(() => {
  return systemReadinessStatus.value !== '';
});

const isSystemReady = computed(() => {
  return systemReadinessIcon.value === 'pass';
});

// Event handlers
const handleWalkthroughClick = (walkthroughId: string) => {
  vscodeApi.postMessage({
    type: 'walkthrough-click',
    payload: { id: walkthroughId }
  });
};

const handleCommandClick = (command: string) => {
  vscodeApi.postMessage({
    type: 'command-click',
    payload: { command }
  });
};

const handleExternalLink = (url: string) => {
  vscodeApi.postMessage({
    type: 'external-link',
    payload: { url }
  });
};

const updateAnsibleCreatorAvailabilityStatus = () => {
  vscodeApi.postMessage({
    type: 'check-system-status'
  });
};

// Message handler for system status updates
const handleSystemStatusUpdate = (data: any) => {
  console.log('Received system status update:', data);

  if (data.systemReadiness) {
    systemReadinessStatus.value = data.systemReadiness.status;
    systemReadinessIcon.value = data.systemReadiness.icon;
    systemReadinessDescription.value = data.systemReadiness.description;
  }

  if (data.details) {
    ansibleVersionStatus.value = data.details.ansibleVersion || '';
    ansibleLocationStatus.value = data.details.ansibleLocation || '';
    pythonVersionStatus.value = data.details.pythonVersion || '';
    pythonLocationStatus.value = data.details.pythonLocation || '';
    ansibleCreatorVersionStatus.value = data.details.ansibleCreatorVersion || '';
    ansibleDevEnvironmentStatus.value = data.details.ansibleDevEnvironment || '';
  }

    if (data.walkthroughs) {
    console.log('Setting walkthroughs:', data.walkthroughs);
    walkthroughs.value = data.walkthroughs;
  }

  if (data.logoUrl) {
    logoUrl.value = data.logoUrl;
  }

  isLoading.value = false;
};

onMounted(() => {
  // Set up message listener
  window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.type) {
      case 'system-status-update':
        handleSystemStatusUpdate(message.payload);
        break;
    }
  });

  // Request initial system status
  updateAnsibleCreatorAvailabilityStatus();
});
</script>

<template>
  <div class="playbookGenerationContainer" :class="{ loading: isLoading }">
    <div class="playbookGenerationSlideCategories">
      <div class="playbookGenerationCategoriesContainer">

        <!-- Header Section -->
        <div class="header">
          <h1 class="title caption">Ansible Development Tools</h1>
          <p class="subtitle description">Create, test and deploy Ansible content in your IT environment</p>

          <!-- System Readiness Display -->
          <div v-if="hasSystemStatus" id="system-readiness" class="statusDisplay">
            <span v-if="isSystemReady" class="codicon codicon-pass"></span>
            <span v-else class="codicon codicon-error"></span>
            <div class="system-description">
              <p v-html="systemReadinessDescription.replace(/\n/g, '<br>')"></p>
            </div>
          </div>
        </div>

        <!-- Left Column - Start and Learn Sections -->
        <div class="categories-column-left">

          <!-- Start Section -->
          <div class="index-list start-container">
            <h2>Start</h2>

            <div class="catalogue">
              <h3>
                <a href="#" @click.prevent="handleCommandClick('ansible.lightspeed.playbookGeneration')">
                  <span class="codicon codicon-file-code"></span> Playbook with Ansible Lightspeed
                </a>
              </h3>
              <p>Create a lists of tasks that automatically execute for your specified inventory or groups of hosts.</p>
            </div>

            <div class="catalogue">
              <h3>
                <a href="#" @click.prevent="handleCommandClick('ansible.content-creator.create-ansible-project')">
                  <span class="codicon codicon-file-zip"></span> New playbook project
                </a>
              </h3>
              <p>Create a foundational framework and structure for setting your Ansible project with playbooks, roles, variables, templates, and other files.</p>
            </div>

            <div class="catalogue">
              <h3>
                <a href="#" @click.prevent="handleCommandClick('ansible.content-creator.create-ansible-collection')">
                  <span class="codicon codicon-file-zip"></span> New collection project
                </a>
              </h3>
              <p>Create a structure for your Ansible collection that includes modules, plugins, molecule scenarios and tests.</p>
            </div>

            <div class="catalogue">
              <h3>
                <a href="#" @click.prevent="handleCommandClick('ansible.create-playbook-options')">
                  <span class="codicon codicon-new-file"></span> New playbook
                </a>
              </h3>
              <p>Create a new playbook</p>
            </div>

            <div class="catalogue">
              <h3>
                <a href="#" @click.prevent="handleExternalLink('https://docs.redhat.com/en/documentation/red_hat_ansible_lightspeed_with_ibm_watsonx_code_assistant/2.x_latest/html-single/red_hat_ansible_lightspeed_with_ibm_watsonx_code_assistant_user_guide/index#using-code-bot-for-suggestions_lightspeed-user-guide')">
                  <span class="codicon codicon-symbol-property"></span> Go to Ansible code bot
                </a>
              </h3>
              <p>Scans your code repositories to recommend code quality improvements.</p>
            </div>
          </div>

          <!-- Learn Section -->
          <div class="index-list start-container">
            <h2>Learn</h2>

            <div class="catalogue">
              <h3>
                <a href="#" @click.prevent="handleExternalLink('https://docs.ansible.com')">
                  Ansible documentation
                  <span class="codicon codicon-link-external"></span>
                </a>
              </h3>
              <p>Explore Ansible documentation, examples and more.</p>
            </div>

            <div class="catalogue">
              <h3>
                <a href="#" @click.prevent="handleExternalLink('https://docs.ansible.com/ansible/latest/getting_started/index.html')">
                  Learn Ansible development
                  <span class="codicon codicon-link-external"></span>
                </a>
              </h3>
              <p>End to end course that will help you master automation development.</p>
            </div>

            <div class="catalogue">
              <h3>Once you are in the YAML file:</h3>
              <p>click Ctrl+L to fire the Ansible Lightspeed AI assistance for editing and explaining code.</p>
            </div>
          </div>

          <div class="shadow"></div>
          <div class="shadow"></div>
          <div class="shadow"></div>
        </div>

        <!-- Right Column - Walkthroughs -->
        <div class="categories-column-right">
          <div class="index-list getting-started">
            <div id="system-check">
              <div class="icon">
                <h2>Walkthroughs</h2>
              </div>

              <ul id="walkthrough-list" v-if="walkthroughs.length > 0">
                <li
                  v-for="walkthrough in walkthroughs"
                  :key="walkthrough.id"
                  class="walkthrough-item"
                  @click="handleWalkthroughClick(walkthrough.id)"
                >
                  <button>
                    <div class="main-content">
                      <div class="icon-widget">
                        <img v-if="logoUrl" :src="logoUrl" alt="Ansible" class="category-icon" />
                      </div>
                      <div class="category-title">{{ walkthrough.title }}</div>
                    </div>
                    <div class="description-content" v-if="walkthrough.description">{{ walkthrough.description }}</div>
                  </button>
                </li>
              </ul>

              <div v-else class="no-walkthroughs">
                <p>Loading walkthroughs...</p>
              </div>
            </div>
          </div>

          <div class="shadow"></div>
          <div class="shadow"></div>
          <div class="shadow"></div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <p></p>
        </div>

      </div>
    </div>
  </div>
</template>
