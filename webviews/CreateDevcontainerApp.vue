<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { vscodeApi } from './lightspeed/src/utils';
import {
  useCommonWebviewState,
  openFolderExplorer,
  clearLogs,
  initializeUI,
  setupMessageHandler,
  clearAllFields,
  createFormValidator,
  createActionWrapper
} from './../src/features/contentCreator/webviewUtils';
import '../media/contentCreator/createDevcontainerPageStyle.css';

const commonState = useCommonWebviewState();
const logs = commonState.logs;
const isCreating = commonState.isCreating;

const homeDir = ref('');
const destinationPath = ref('');
const selectedImage = ref('upstream');
const isOverwritten = ref(false);
const projectUrl = ref('');
const openDevcontainerButtonDisabled = ref(true);
const createButtonDisabled = ref(true);
const defaultDestinationPath = ref('');
const requirementsMet = ref(true);
const requirementFailures = ref([]);

const isFormValid = createFormValidator({
  destinationPath: () => {
    // Match original logic: valid if field has value or placeholder is available
    return destinationPath.value.trim() !== '' || (defaultDestinationPath.value || homeDir.value) !== '';
  }
});

const displayPath = computed(() => {
  return destinationPath.value.trim() || defaultDestinationPath.value || homeDir.value;
});

const devcontainerPath = computed(() => {
  const path = displayPath.value;
  if (!path) {
    return "No folders are open in the workspace - Enter a destination directory.";
  }
  return `${path}/.devcontainer`;
});

const handleOpenFolderExplorer = () => {
  openFolderExplorer(
    destinationPath.value || defaultDestinationPath.value || homeDir.value,
    homeDir.value,
    { selectOption: 'folder' }
  );
};

const handleOpenDevcontainer = () => {
  if (!projectUrl.value) return;
  vscodeApi.postMessage({
    type: "init-open-devcontainer-folder",
    payload: {
      projectUrl: projectUrl.value,
    },
  });
};

const handleCreate = createActionWrapper(
  isCreating,
  logs,
  createButtonDisabled,
  () => {
    openDevcontainerButtonDisabled.value = true;
    // Match original implementation: use placeholder as fallback
    let path: string;
    if (destinationPath.value === "" || !destinationPath.value.trim()) {
      path = defaultDestinationPath.value || homeDir.value;
    } else {
      path = destinationPath.value.trim();
    }
    
    const payload = {
      destinationPath: path,
      image: selectedImage.value.trim(),
      isOverwritten: isOverwritten.value,
    };
    vscodeApi.postMessage({
      type: 'init-create-devcontainer',
      payload,
    });
  }
);

const onClear = () => {
  // Match original implementation: reset field to placeholder value
  destinationPath.value = defaultDestinationPath.value || homeDir.value;
  selectedImage.value = 'upstream';
  isOverwritten.value = false;
  logs.value = '';
  projectUrl.value = '';
  
  openDevcontainerButtonDisabled.value = true;
  createButtonDisabled.value = !isFormValid() || isCreating.value;
  isCreating.value = false;
};

watch([destinationPath, isCreating], () => {
  createButtonDisabled.value = !isFormValid() || isCreating.value;
});

onMounted(() => {
  vscodeApi.postMessage({ type: 'request-requirements-status' });
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'requirements-status') {
      requirementsMet.value = event.data.met;
      requirementFailures.value = event.data.failures || [];
    }
  });
  setupMessageHandler({
    onHomeDirectory: (data) => {
      homeDir.value = data;
      if (!defaultDestinationPath.value) {
        defaultDestinationPath.value = data;
        destinationPath.value = data; // Set as default value
      }
    },
    onHomedirAndTempdir: (homedir) => {
      if (homedir && !defaultDestinationPath.value) {
        defaultDestinationPath.value = homedir;
        destinationPath.value = homedir; // Set as default value
      }
    },
    onFolderSelected: (data) => {
      destinationPath.value = data;
    },
    onExecutionLog: (args) => {
      logs.value = args.commandOutput || '';
      projectUrl.value = args.projectUrl || '';

      if (args.status === 'passed') {
        openDevcontainerButtonDisabled.value = false;
      } else {
        openDevcontainerButtonDisabled.value = true;
      }
      isCreating.value = false;
      createButtonDisabled.value = !isFormValid() || isCreating.value;
    }
  });
  initializeUI();
});
</script>
<template>
  <body>
    <div :class="{ 'disabled-content': !requirementsMet }">
      <div class="title-description-div">
        <h1>Create a devcontainer</h1>
        <p class="subtitle">Build containerized development environments</p>
      </div>
      
      <div class="description-div">
        <h3>Devcontainers are json files used for building containerized development environments.<br><br>Enter your project details below to utilize a devcontainer template designed for the <a href="https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers">Dev Containers</a> extension.</h3>
      </div>
            <form id="devcontainer-form">
              <section class="component-container">

                <vscode-form-group variant="vertical">
                  <vscode-label for="path-url">
                    <span class="normal">Destination directory </span>
                    <sup>*</sup>
                  </vscode-label>
                  <vscode-textfield 
                    id="path-url" 
                    v-model="destinationPath"
                    class="required" 
                    form="devcontainer-form" 
                    :placeholder="defaultDestinationPath || homeDir"
                    size="512"
                  >
                    <vscode-icon
                      slot="content-after"
                      id="folder-explorer"
                      name="folder-opened"
                      action-icon
                      @click="handleOpenFolderExplorer"
                    ></vscode-icon>
                  </vscode-textfield>
                </vscode-form-group>

                <div id="full-devcontainer-path" class="full-devcontainer-path">
                  <p>Devcontainer path:&nbsp;{{ devcontainerPath }}</p>
                </div>

                <div class="image-div">
                  <div class="dropdown-container">
                    <vscode-label for="image-dropdown">
                      <span class="normal">Container image</span>
                    </vscode-label>
                    <vscode-single-select 
                      id="image-dropdown" 
                      :value="selectedImage"
                      @change="selectedImage = ($event.target as HTMLSelectElement).value"
                      position="below"
                    >
                      <vscode-option value="upstream">
                        Upstream (ghcr.io/ansible/community-ansible-dev-tools:latest)
                      </vscode-option>
                      <vscode-option value="downstream">
                        Downstream (registry.redhat.io/ansible-automation-platform-25/ansible-dev-tools-rhel8:latest)
                      </vscode-option>
                    </vscode-single-select>
                  </div>
                </div>

                <div class="checkbox-div">
                  <vscode-checkbox 
                    id="overwrite-checkbox" 
                    :checked="isOverwritten"
                    @change="isOverwritten = ($event.target as HTMLInputElement).checked"
                    form="devcontainer-form"
                  >
                    Overwrite <br>
                    <i>Overwrite an existing devcontainer.</i>
                  </vscode-checkbox>
                </div>

                <div class="group-buttons">
                  <vscode-button 
                    id="reset-button" 
                    @click.prevent="onClear"
                    form="devcontainer-form" 
                    appearance="secondary"
                  >
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Reset All
                  </vscode-button>
                  <vscode-button 
                    id="create-button" 
                    @click.prevent="handleCreate"
                    :disabled="!isFormValid || isCreating"
                    form="devcontainer-form"
                  >
                    <span class="codicon codicon-run-all"></span>
                    &nbsp; {{ isCreating ? 'Creating...' : 'Create' }}
                  </vscode-button>
                </div>

                <vscode-divider></vscode-divider>

                <vscode-form-group variant="vertical">
                  <vscode-label id="vscode-logs-label" for="log-text-area">
                  <span class="normal">Logs</span>
                  </vscode-label>
                  <vscode-textarea 
                  id="log-text-area" 
                  v-model="logs"
                  cols="90" 
                  rows="15" 
                  placeholder="Output of the command execution"
                  resize="vertical" 
                  readonly
                  style="width: 100%; height: 200px;"
                  ></vscode-textarea>
                </vscode-form-group>

                <div class="group-buttons">
                  <vscode-button 
                    id="clear-logs-button" 
                    @click.prevent="clearLogs(commonState.logs)"
                    form="devcontainer-form" 
                    appearance="secondary"
                  >
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Clear Logs
                  </vscode-button>
                  <vscode-button 
                    id="open-file-button" 
                    @click.prevent="handleOpenDevcontainer"
                    :disabled="openDevcontainerButtonDisabled"
                    form="devcontainer-form" 
                    appearance="secondary"
                  >
                    <span class="codicon codicon-go-to-file"></span>
                    &nbsp; Open Devcontainer
                  </vscode-button>
                </div>

                <div id="required-fields" class="required-fields">
                  <p>Fields marked with an asterisk (*) are required</p>
                </div>

              </section>
            </form>
    </div>
  </body>
</template>