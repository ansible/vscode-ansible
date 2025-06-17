<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { vscodeApi } from './lightspeed/src/utils';
import '../media/contentCreator/createRolePageStyle.css';

const homeDir = ref('');
const roleName = ref('');
const collectionPath = ref('');
const verbosity = ref('Off');
const isOverwritten = ref(false);
const logs = ref('');
const isCreating = ref(false);
const projectUrl = ref('');
const openRoleButtonDisabled = ref(true);
const createButtonDisabled = ref(true);
const defaultCollectionPath = ref('');

const isFormValid = computed(() => {
  return roleName.value.trim() !== '';
});

const displayPath = computed(() => {
return collectionPath.value.trim() || defaultCollectionPath.value || homeDir.value;
});

function openFolderExplorer() {
  vscodeApi.postMessage({
    type: 'openFolderExplorer',
    payload: {
      selectOption: 'folder',
      defaultPath: collectionPath.value || defaultCollectionPath.value || homeDir.value,
    },
  });
}

function handleCreate() {
  if (!isFormValid.value) return;

  isCreating.value = true;
  logs.value = '';
  updateCreateButtonState();
  openRoleButtonDisabled.value = true;
  const actualCollectionPath = collectionPath.value.trim() || defaultCollectionPath.value || homeDir.value;
  const payload = {
    roleName: roleName.value.trim(),
    collectionPath: actualCollectionPath,
    verbosity: verbosity.value.trim(),
    isOverwritten: isOverwritten.value,
  };

  vscodeApi.postMessage({
    type: 'init-create-role',
    payload,
  });
}

function onClear() {
  roleName.value = '';
  collectionPath.value = '';
  verbosity.value = 'Off';
  isOverwritten.value = false;
  logs.value = '';
  projectUrl.value = '';
  openRoleButtonDisabled.value = true;
  createButtonDisabled.value = true;
  isCreating.value = false;
}

function clearLogs() {
  logs.value = '';
}

function handleOpenRole() {
  if (!projectUrl.value || !roleName.value.trim()) return;

  vscodeApi.postMessage({
    type: 'init-open-role-folder',
    payload: {
      projectUrl: projectUrl.value,
      roleName: roleName.value.trim(),
    },
  });
}

function updateCreateButtonState() {
  createButtonDisabled.value = !isFormValid.value || isCreating.value;
}

watch([roleName, isCreating], () => {
  updateCreateButtonState();
});

onMounted(() => {
  window.addEventListener('message', (event) => {
    const message = event.data;

    if (message.type === 'homeDirectory') {
      homeDir.value = message.data;
    } else if (message.command === 'homedirAndTempdir') {
      if (message.homedir && !defaultCollectionPath.value) {
        defaultCollectionPath.value = message.homedir;
      }
    } else if (message.type === 'folderSelected') {
      collectionPath.value = message.data;
    } else if (message.command === 'execution-log') {
      logs.value = message.arguments.commandOutput || '';
      projectUrl.value = message.arguments.projectUrl || '';

      if (message.arguments.status === 'passed') {
        openRoleButtonDisabled.value = false;
      } else {
        openRoleButtonDisabled.value = true;
      }
      isCreating.value = false;
      updateCreateButtonState();
    }
  });
  vscodeApi.postMessage({ type: 'ui-mounted' });
});

</script>

<template>
  <body>
    <div class="title-description-div">
      <h1>Add a role to an existing collection</h1>
      <p class="subtitle">Extending automation with Ansible roles</p>
    </div>

    <div class="description-div">
      <h3>Ansible roles are modular units that group related tasks and files to promote reusability and organized automation.</h3>
    </div>

    <form id="role-form">
      <section class="component-container">

        <vscode-form-group variant="vertical">
          <vscode-label for="path-url">
            <span class="normal">Collection root directory</span>
            <sup>*</sup>
          </vscode-label>
          <vscode-textfield
            id="path-url"
            v-model="collectionPath"
            class="required"
            form="role-form"
            :placeholder="defaultCollectionPath || homeDir"
            size="512"
          >
            <vscode-icon
              slot="content-after"
              id="folder-explorer"
              name="folder-opened"
              action-icon
              @click="openFolderExplorer"
            ></vscode-icon>
          </vscode-textfield>
        </vscode-form-group>

        <div class="role-name-div">
          <vscode-form-group variant="vertical">
            <vscode-label for="role-name">
              <span class="normal">Role name</span>
              <sup>*</sup>
            </vscode-label>
            <vscode-textfield
              id="role-name"
              v-model="roleName"
              form="role-form"
              placeholder="Enter role name"
              size="512"
            ></vscode-textfield>
          </vscode-form-group>
        </div>

        <div id="full-collection-path" class="full-collection-path">
          <p>
            Project path:&nbsp;{{ displayPath }}
          </p>
        </div>

        <div class="verbose-div">
          <div class="dropdown-container">
            <vscode-label for="verbosity-dropdown">
              <span class="normal">Output Verbosity</span>
            </vscode-label>
            <vscode-single-select
              id="verbosity-dropdown"
              :value="verbosity"
              @change="verbosity = ($event.target as HTMLSelectElement).value"
              position="below"
            >
              <vscode-option value="Off">Off</vscode-option>
              <vscode-option value="Low">Low</vscode-option>
              <vscode-option value="Medium">Medium</vscode-option>
              <vscode-option value="High">High</vscode-option>
            </vscode-single-select>
          </div>
        </div>

        <div class="checkbox-div">
          <vscode-checkbox
            id="overwrite-checkbox"
            :checked="isOverwritten"
            @change="isOverwritten = ($event.target as HTMLInputElement).checked"
            form="role-form"
          >
            Overwrite <br>
            <i>Overwriting will replace an existing role with the same name if present in the collection.</i>
          </vscode-checkbox>
        </div>

        <div class="group-buttons">
          <vscode-button
            id="clear-button"
            @click.prevent="onClear"
            form="role-form"
            appearance="secondary"
          >
            <span class="codicon codicon-clear-all"></span>
            &nbsp; Clear All
          </vscode-button>
          <vscode-button
            id="create-button"
            @click.prevent="handleCreate"
            :disabled="!isFormValid || isCreating"
            form="role-form"
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
          ></vscode-textarea>
        </vscode-form-group>

        <div class="group-buttons">
          <vscode-button
            id="clear-logs-button"
            @click.prevent="clearLogs"
            form="role-form"
            appearance="secondary"
          >
            <span class="codicon codicon-clear-all"></span>
            &nbsp; Clear Logs
          </vscode-button>
          <vscode-button
            id="open-folder-button"
            @click.prevent="handleOpenRole"
            :disabled="openRoleButtonDisabled"
            form="role-form"
            appearance="secondary"
          >
            <span class="codicon codicon-go-to-file"></span>
            &nbsp; Open Role
          </vscode-button>
        </div>

        <div id="required-fields" class="required-fields">
          <p>Fields marked with an asterisk (*) are required</p>
        </div>

      </section>
    </form>
  </body>
</template>
