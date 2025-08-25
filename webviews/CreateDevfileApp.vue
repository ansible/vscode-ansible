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
import '../media/contentCreator/createDevfilePageStyle.css';

const commonState = useCommonWebviewState();
const logs = commonState.logs;
const isCreating = commonState.isCreating;

const homeDir = ref('');
const destinationPath = ref('');
const devfileName = ref('');
const selectedImage = ref('Upstream (ghcr.io/ansible/ansible-devspaces:latest)');
const isOverwritten = ref(false);
const projectUrl = ref('');
const openDevfileButtonDisabled = ref(true);
const createButtonDisabled = ref(true);
const defaultDestinationPath = ref('');
const defaultProjectName = ref('');
const requirementsMet = ref(true);
const requirementFailures = ref([]);

const isFormValid = createFormValidator({
  destinationPath: () => {
    return destinationPath.value.trim() !== '' || (defaultDestinationPath.value || homeDir.value) !== '';
  },
  devfileName: () => {
    return devfileName.value.trim() !== '' || defaultProjectName.value !== '';
  }
});

const displayPath = computed(() => {
  return destinationPath.value.trim() || defaultDestinationPath.value || homeDir.value;
});

const displayName = computed(() => {
  return devfileName.value.trim() || defaultProjectName.value;
});

const devfilePath = computed(() => {
  const path = displayPath.value;
  const name = displayName.value;
  if (!path) {
    return "No folders are open in the workspace - Enter a destination directory.";
  }
  return `${path}/devfile.yaml`;
});

const handleOpenFolderExplorer = () => {
  openFolderExplorer(
    destinationPath.value || defaultDestinationPath.value || homeDir.value,
    homeDir.value,
    { selectOption: 'folder' }
  );
};

const handleOpenDevfile = () => {
  if (!projectUrl.value) return;
  vscodeApi.postMessage({
    type: "init-open-devfile",
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
    openDevfileButtonDisabled.value = true;

    let path: string;
    if (destinationPath.value === "" || !destinationPath.value.trim()) {
      path = defaultDestinationPath.value || homeDir.value;
    } else {
      path = destinationPath.value.trim();
    }

    let name: string;
    if (devfileName.value === "" || !devfileName.value.trim()) {
      name = defaultProjectName.value;
    } else {
      name = devfileName.value.trim();
    }

    const payload = {
      destinationPath: path,
      name: name,
      image: selectedImage.value.trim(),
      isOverwritten: isOverwritten.value,
    };

    vscodeApi.postMessage({
      type: 'init-create-devfile',
      payload,
    });
  }
);

const onClear = () => {
  destinationPath.value = defaultDestinationPath.value || homeDir.value;
  devfileName.value = defaultProjectName.value;
  selectedImage.value = 'Upstream (ghcr.io/ansible/ansible-devspaces:latest)';
  isOverwritten.value = false;
  logs.value = '';
  projectUrl.value = '';

  openDevfileButtonDisabled.value = true;
  createButtonDisabled.value = !isFormValid() || isCreating.value;
  isCreating.value = false;
};

watch([destinationPath, devfileName, isCreating], () => {
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
      // Extract project name from workspace path
      if (data && !defaultProjectName.value) {
        const projectNameSplit = data.split("/");
        const extractedName = projectNameSplit[projectNameSplit.length - 1];
        if (extractedName) {
          defaultProjectName.value = extractedName;
          devfileName.value = extractedName; // Set as default value
        }
      }
    },
    onFolderSelected: (data) => {
      destinationPath.value = data;
    },
    onExecutionLog: (args) => {
      logs.value = args.commandOutput || '';
      projectUrl.value = args.projectUrl || '';

      if (args.status === 'passed') {
        openDevfileButtonDisabled.value = false;
      } else {
        openDevfileButtonDisabled.value = true;
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
        <h1>Create a devfile</h1>
        <p class="subtitle">Leverage Red Hat Openshift Dev Spaces</p>
      </div>

      <div class="description-div">
        <h3>Devfiles are yaml files used for development environment customization.<br><br>Enter your project details below to utilize a devfile template designed for Red Hat OpenShift Dev Spaces.</h3>
      </div>

      <form id="devfile-form">
        <section class="component-container">

        <vscode-form-group variant="vertical">
          <vscode-label for="path-url">
            <span class="normal">Destination directory</span>
            <sup>*</sup>
          </vscode-label>
          <vscode-textfield
            id="path-url"
            v-model="destinationPath"
            class="required"
            form="devfile-form"
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

        <vscode-form-group variant="vertical">
          <vscode-label for="devfile-name">
            <span class="normal">Ansible project name</span>
            <sup>*</sup>
          </vscode-label>
          <vscode-textfield
            id="devfile-name"
            v-model="devfileName"
            form="devfile-form"
            :placeholder="defaultProjectName"
            size="512"
          ></vscode-textfield>
        </vscode-form-group>

        <div id="full-devfile-path" class="full-devfile-path">
          <p>Devfile path:&nbsp;{{ devfilePath }}</p>
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
              <vscode-option value="Upstream (ghcr.io/ansible/ansible-devspaces:latest)">
                Upstream (ghcr.io/ansible/ansible-devspaces:latest)
              </vscode-option>
            </vscode-single-select>
          </div>
        </div>

        <div class="checkbox-div">
          <vscode-checkbox
            id="overwrite-checkbox"
            :checked="isOverwritten"
            @change="isOverwritten = ($event.target as HTMLInputElement).checked"
            form="devfile-form"
          >
            Overwrite <br>
            <i>Overwrite an existing devfile.</i>
          </vscode-checkbox>
        </div>

        <div class="group-buttons">
          <vscode-button
            id="reset-button"
            @click.prevent="onClear"
            form="devfile-form"
            appearance="secondary"
          >
            <span class="codicon codicon-clear-all"></span>
            &nbsp; Reset All
          </vscode-button>
          <vscode-button
            id="create-button"
            @click.prevent="handleCreate"
            :disabled="!isFormValid || isCreating"
            form="devfile-form"
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
            rows="10"
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
            form="devfile-form"
            appearance="secondary"
          >
            <span class="codicon codicon-clear-all"></span>
            &nbsp; Clear Logs
          </vscode-button>
          <vscode-button
            id="open-file-button"
            @click.prevent="handleOpenDevfile"
            :disabled="openDevfileButtonDisabled"
            form="devfile-form"
            appearance="secondary"
          >
            <span class="codicon codicon-go-to-file"></span>
            &nbsp; Open Devfile
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
