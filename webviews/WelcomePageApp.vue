<script setup lang="ts">
import '@vscode/codicons/dist/codicon.css';
import { onMounted, ref, computed } from 'vue';
import { vscodeApi } from './lightspeed/src/utils';

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

const ansibleVersionStatus = ref('');
const ansibleLocationStatus = ref('');
const pythonVersionStatus = ref('');
const pythonLocationStatus = ref('');
const ansibleCreatorVersionStatus = ref('');
const ansibleDevEnvironmentStatus = ref('');

const hasSystemStatus = computed(() => {
  return systemReadinessStatus.value !== '';
});

const isSystemReady = computed(() => {
  return systemReadinessIcon.value === 'pass';
});

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

  window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.type) {
      case 'system-status-update':
        handleSystemStatusUpdate(message.payload);
        break;
    }
  });

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
                <a href="#" @click.prevent="handleCommandClick('ansible.mcpServer.enabled')">
                  <span class="codicon codicon-wand"></span> Ansible Development Tools MCP Server (AI)
                </a>
              </h3>
              <p>Provides native VS Code AI integration, enabling AI assistants to interact with Ansible content and developer tools.</p>
            </div>

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
                <a href="#" @click.prevent="handleExternalLink('https://docs.ansible.com/projects/ansible/latest/getting_started/index.html')">
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

<style>
/* welcomePage/style.css */
.playbookGenerationContainer {
  box-sizing: border-box;
  line-height: 22px;
  position: relative;
  overflow: hidden;
  height: inherit;
  width: 100%;
  user-select: initial;
  -webkit-user-select: initial;
  outline: none;
}

a .codicon {
  font-size: 20px;
}

.playbookGenerationContainer.loading {
  display: none;
}

.playbookGenerationContainer a {
  text-decoration: none;
}

.playbookGenerationContainer img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  pointer-events: none;
}

#system-readiness {
  display: flex;
  flex-direction: row;
  margin-top: 14px;
  padding: 12px 16px;
  background-color: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
}

.codicon.codicon-pass {
  margin: 0 8px 0 0;
  color: #73C991;
  font-size: 16px;
  align-self: flex-start;
}

#system-readiness-error {
  display: flex;
  flex-direction: row;
  margin-top: 14px;
  background-color: var(--vscode-input-background);
}

.codicon.codicon-error {
  margin: 10px;
  color: red;
}

.codicon.codicon-warning {
  margin: 10px;
  color: red;
}

.system-description {
  padding: 0px;
  margin: 0;
  flex: 1;
}

.system-description p {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
}

#system-check {
  display: flex;
  align-items: start;
  flex-direction: column;
}

#install-status {
  padding: 0px 10px 0px 10px;
  width: fit-content;
  background-color: var(--vscode-input-background);
}

.found::before {
  color: darkgreen;
  content: "✓ ";
}

.not-found::before {
  color: red;
  content: "✗ ";
}

.not-found-optional::before {
  color: gold;
  content: "⚠ ";
}

.refresh-button-div {
  margin-top: 8px;
  width: 100%;
  display: flex;
}

.playbookGenerationContainer .title {
  border: none;
  font-size: 2.7em;
  font-weight: 400;
  color: var(--vscode-foreground);
  white-space: nowrap;
  margin-bottom: 12px;
}

.playbookGenerationContainer .subtitle {
  color: var(--vscode-descriptionForeground);
  line-height: 1.4em;
  display: block;
  font-size: 2em;
  margin: 0px;
}

.monaco-workbench.hc-black .part.editor>.content .playbookGenerationContainer .subtitle,
.monaco-workbench.hc-light .part.editor>.content .playbookGenerationContainer .subtitle {
  font-weight: 200;
}

.playbookGenerationContainer h2 {
  font-weight: 400;
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 1.5em;
  line-height: initial;
}

.index-list {
  margin-bottom: 36px;
}

.catalogue {
  margin-bottom: 12px;
}

.catalogue h3 {
  margin: 0px;
  font-weight: normal;
}

.catalogue p {
  margin: 0px;
}

.playbookGenerationContainer a:focus {
  outline: 1px solid -webkit-focus-ring-color;
  outline-offset: -1px;
  text-decoration: underline;
}

.playbookGenerationContainer .playbookGenerationSlide {
  width: 100%;
  height: 100%;
  padding: 0;
  position: absolute;
  box-sizing: border-box;
  left: 0;
  top: 0;
}

.playbookGenerationContainer .playbookGenerationSlideCategories {
  padding: 12px 24px;
}

.playbookGenerationContainer .playbookGenerationSlideCategories>.playbookGenerationCategoriesContainer>* {
  overflow: hidden;
  text-overflow: ellipsis;
}

.playbookGenerationContainer .playbookGenerationSlideCategories>.playbookGenerationCategoriesContainer>.categories-column>div {
  margin-bottom: 32px;
}

.playbookGenerationContainer .playbookGenerationSlideCategories>.playbookGenerationCategoriesContainer>.categories-column-left {
  grid-area: left-column;
  margin-top: 25px;
}

.playbookGenerationContainer .playbookGenerationSlideCategories>.playbookGenerationCategoriesContainer>.categories-column-right {
  grid-area: right-column;
  margin-top: 25px;
}

.playbookGenerationContainer .playbookGenerationSlideCategories>.playbookGenerationCategoriesContainer {
  display: grid;
  height: 100%;
  max-width: 1200px;
  margin: 0 auto;
  margin-top: 50px;
  margin-bottom: 20px;
  grid-template-columns: 1fr 6fr 1fr 6fr 1fr;
  grid-template-areas:
    ".  header header header ."
    ". left-column . right-column ."
    ". footer footer footer .";
}

.playbookGenerationContainer.width-constrained .playbookGenerationSlideCategories>.playbookGenerationCategoriesContainer {
  grid-template-rows: auto min-content minmax(min-content, auto) min-content;
  grid-template-columns: 1fr;
  grid-template-areas: "header" "left-column" "right-column" "footer";
}

.playbookGenerationContainer.height-constrained .playbookGenerationSlideCategories>.playbookGenerationCategoriesContainer {
  grid-template-rows: auto minmax(min-content, auto) min-content;
  grid-template-areas: "header" "left-column right-column" "footer footer";
}

.playbookGenerationContainer.height-constrained.width-constrained .playbookGenerationSlideCategories>.playbookGenerationCategoriesContainer {
  grid-template-rows: min-content minmax(min-content, auto) min-content;
  grid-template-columns: 1fr;
  grid-template-areas: "left-column" "right-column" "footer";
}

.playbookGenerationContainer.width-constrained .playbookGenerationSlideCategories>.playbookGenerationCategoriesContainer>.header,
.playbookGenerationContainer.height-constrained .playbookGenerationCategoriesContainer>.header {
  display: none;
}

.playbookGenerationContainer .playbookGenerationSlideCategories>.playbookGenerationCategoriesContainer>.header {
  grid-area: header;
  align-self: end;
}

.playbookGenerationContainer .playbookGenerationSlideCategories .gap {
  flex: 150px 0 1000
}

.playbookGenerationContainer .playbookGenerationSlideCategories>.playbookGenerationCategoriesContainer > .header > .subtitle {
  font-size: 1em;
}

div.index-list.getting-started #system-check h2 {
  font-size: 1.5em;
  font-weight: 400;
  line-height: normal;
  margin-bottom: 5px;
  margin-top: 0;
}

ul#walkthrough-list {
  list-style: none;
  padding: 3px 6px 6px;
  padding-left: 0;
  box-sizing: border-box;
  font-size: 13px;
  line-height: normal;
  margin: 8px 8px 8px 0;
  text-align: left;
  width: calc(100% - 16px);
}

ul#walkthrough-list button {
  background: var(--vscode-welcomePage-tileBackground);
  border: none;
  color: inherit;
  font-family: inherit;
  font-size: 13px;
  margin: 1px 0;
  padding: 12px;
  text-align: left;
  width: 100%;
}

ul#walkthrough-list button:hover {
  background: var(--vscode-welcomePage-tileHoverBackground);
  outline-color: var(--vscode-contrastActiveBorder, var(--vscode-focusBorder));
  cursor: pointer;
}

ul#walkthrough-list button:focus {
  outline: none;
}

ul#walkthrough-list > .walkthrough-item {
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
  font-size: 13px;
  line-height: normal;
  margin: 4px 4px 4px 0;
  padding: 8px 12px;
  text-align: left;
  width: calc(100% - 8px);
}

ul#walkthrough-list > .walkthrough-item .featured-badge {
  left: -8px;
  position: relative;
  top: -4px;
}

ul#walkthrough-list > .walkthrough-item .main-content {
  align-items: center;
  display: flex;
  justify-content: flex-start;
  width: 100%;
}

ul#walkthrough-list > .walkthrough-item img.category-icon {
  max-height: 20px;
  max-width: 20px;
  padding-right: 8px;
  position: relative;
  top: auto;
}

ul#walkthrough-list > .walkthrough-item .icon-widget {
  color: var(--vscode-textLink-foreground);
  font-size: 20px;
  padding-right: 8px;
  position: relative;
  top: 3px;
}

ul#walkthrough-list > .walkthrough-item .category-title {
  display: inline-block;
  font-size: 14px;
  font-weight: 500;
  margin: 4px 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

ul#walkthrough-list > .walkthrough-item .category-title.max-lines-3 {
  line-clamp: 3;
  display: box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

ul#walkthrough-list > .walkthrough-item .codicon.hide-category-button {
  margin-left: auto;
  right: 8px;
  top: 4px;
}

ul#walkthrough-list > .walkthrough-item .hide-category-button {
  border-radius: 5px;
  padding: 3px;
  visibility: hidden;
}

.codicon[class*=codicon-] {
  font-size: 16px;
}

ul#walkthrough-list > .walkthrough-item .description-content:not(:empty) {
  margin-bottom: 8px;
}

ul#walkthrough-list > .walkthrough-item .description-content {
  margin-left: 28px;
  text-align: left;
}

ul#walkthrough-list > .walkthrough-item .category-progress {
  bottom: 0;
  left: 0;
  position: absolute;
  width: 100%;
}

/* contentCreator/welcomePageStyle.css */
body {
  margin: 0;
  box-sizing: border-box;
}

.intro {
  padding: auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin-bottom: 20px;
}

.intro .heading {
  padding: auto;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
}

.intro .heading h1 {
  font-size: 30px;
}

.intro .heading img {
  width: 40px;
  height: auto;
}

.intro #system-check {
  display: flex;
  align-items: start;
  flex-direction: column;
  padding: 10px;
  border-style: dotted;
  border-color: #444444;
  width: fit-content;
  background-color: var(--vscode-input-background);
}

.codicon-account {
  color: green;
}

.menu {
  display: flex;
  justify-content: space-around;
  align-items: center;
  flex-direction: row;
}

.menu .menu-item {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  vertical-align: middle;
  padding: 10px;
}

.menu .menu-item .menu-item-heading {
  font-size: 18px;
  margin: 2px 10px;
  margin-bottom: 8px;
  vertical-align: middle;
  justify-content: center;
  align-content: center;
  text-align: center;
}

.menu .menu-item .menu-item-text {
  margin: 0px 10px;
  justify-content: center;
}

.menu vscode-link {
  color: var(--vscode-foreground);
  text-decoration: none;
}

.menu vscode-link:hover {
  color: var(--vscode-foreground);
  text-decoration: none;
}

.menu .menu-item img {
  background-color: #3A3D41;
  padding: 20px;
  width: 45px;
  height: auto;
}

.menu .menu-item img:hover {
  background-color: #45494E;
}
</style>
