<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { vscodeApi } from './utils';
// import { VscodeFormGroup } from '@vscode/webview-ui-toolkit';
import '../../../media/contentCreator/createAnsibleProjectPageStyle.css';

// placeholder for the home directory
const homeDir = ref('');
const namespace = ref("");
const collectionName = ref("");
const initPath = ref("");
const verbosity = ref("off");
const logToFile = ref(false);
const logFileAppend = ref(false);
const isOverwritten = ref(false);
const isEditableModeInstall = ref(false);
const logFilePath = ref("");
const logLevel = ref("debug");
const logs = ref("");
const logFileUrl = ref("");
const collectionUrl = ref("");
const fullCollectionName = ref("");
const defaultLogFilePath = ref("");
const isCreating = ref(false);
const openLogFileButtonDisabled = ref(true);
const openScaffoldedFolderButtonDisabled = ref(true);
const createButtonDisabled = ref(false);
const projectUrl = ref("");
let logToFileOptionsDiv;
let logToFileCheckbox;

function openFolderExplorer() {
  vscodeApi.postMessage({
    type: 'openFolderExplorer',
    payload: {
      defaultPath: initPath.value || homeDir.value,
    },
  });
}

const canCreate = computed(() => {
  return (
    namespace.value.trim() !== "" &&
    collectionName.value.trim() !== ""
  );
});

function openFileExplorer() {
  vscodeApi.postMessage({
    type: 'openFileExplorer',
    payload: {
      defaultPath: logFilePath.value || defaultLogFilePath.value || homeDir.value,
    },
  });
}

onMounted(() => {
  window.addEventListener('message', (event) => {
    const message = event.data;

    if (message.type === 'homeDirectory') {
      homeDir.value = message.data;
    } else if (message.type === 'folderSelected') {
      initPath.value = message.data;
    } else if (message.type === 'fileSelected') {
      logFilePath.value = message.data;
    } else if (message.command === 'homedirAndTempdir') {
      homeDir.value = message.homedir;
      defaultLogFilePath.value = `${message.tempdir}/ansible-creator.log`;
    } else if (message.type === 'logs') {
      logs.value += message.data + '\n';
    } else if (message.command === "execution-log" && isCreating.value) {
      logs.value = message.arguments.commandOutput;
      logFileUrl.value = message.arguments.logFileUrl;
      openLogFileButtonDisabled.value = !logFileUrl.value;
      openScaffoldedFolderButtonDisabled.value = message.arguments.status !== "passed";
      projectUrl.value = message.arguments.projectUrl || "";
      createButtonDisabled.value = false;

      if (message.arguments.status === "passed" || message.arguments.status === "failed") {
        isCreating.value = false; // done listening
      }
    }
  });
  vscodeApi.postMessage({ type: 'ui-mounted' });
});

function clearLogs() {
  logs.value = "";
}

function copyLogs() {
  vscodeApi.postMessage({
    type: "init-copy-logs",
    payload: {
      initExecutionLogs: logs.value,
    }
  });
}
async function openLogFile() {
  vscodeApi.postMessage({
    type: "init-open-log-file",
    payload: {
      logFileUrl: logFileUrl.value,
    },
  });
}

function handleInitOpenScaffoldedFolderClick() {
  vscodeApi.postMessage({
    type: "init-open-scaffolded-folder",
    payload: {
        projectUrl: projectUrl.value,
    },
  });
}

function handleCreate() {
  isCreating.value = true;
  logs.value = "";  // clear logs on new create
  createButtonDisabled.value = true; 

  const payload = {
    destinationPath: initPath.value,
    namespaceName: namespace.value,
    collectionName: collectionName.value,
    verbosity: verbosity.value,
    logToFile: logToFile.value,
    logFileAppend: logFileAppend.value,
    isEditableModeInstall: isEditableModeInstall.value,
    logFilePath: logFilePath.value || defaultLogFilePath.value,
    logLevel: logLevel.value,
    isOverwritten: isOverwritten.value,
  };

  vscodeApi.postMessage({ type: "init-create", payload });
}

async function onClear() {
  namespace.value = "";
  collectionName.value = "";
  initPath.value = "";
  verbosity.value = "off";
  logToFile.value = false;
  logFileAppend.value = false;
  isOverwritten.value = false;
  isEditableModeInstall.value = false;
  logFilePath.value = "";
  logLevel.value = "debug";
  logs.value = "";
  logFileUrl.value = "";
  collectionUrl.value = "";
  fullCollectionName.value = "";
  vscodeApi.postMessage({ type: "ui-mounted" });
}
</script>
<template>
    <body>
        <div class="title-div">
            <h1>Create new Ansible collection</h1>
            <p class="subtitle">Streamlining automation</p>
        </div>
        <form id="init-form">
            <section class="component-container">

                <vscode-form-group variant="vertical">
                  <vscode-label for="path-url">
                    <span class="normal">Destination directory</span>
                  </vscode-label>
                  <vscode-textfield id="path-url" class="required" form="init-form" :placeholder="homeDir"  v-model="initPath"
                    size="512">
                    <vscode-icon
                      slot="content-after"
                      id="folder-explorer"
                      name="folder-opened"
                      @click="openFolderExplorer"
                      action-icon
                    ></vscode-icon>
                  </vscode-textfield>
                </vscode-form-group>
                <div class="playbook-project-div">
                <vscode-form-group variant="vertical">
                  <vscode-label for="namespace-name">
                    <span class="normal">Namespace *</span>
                  </vscode-label>
                  <vscode-textfield id="namespace-name" form="init-form" placeholder="Enter namespace name" size="512" v-model="namespace"></vscode-textfield>
                </vscode-form-group>
                <vscode-form-group variant="vertical">
                  <vscode-label for="collection-name">
                    <span class="normal">Collection *</span>
                  </vscode-label>
                  <vscode-textfield id="collection-name" form="init-form" placeholder="Enter collection name" size="512" v-model="collectionName"></vscode-textfield>
                </vscode-form-group>
                </div>
                <div id="full-collection-path" class="full-collection-path">
                  <p>Project path: {{ initPath || homeDir }}</p>
                </div>
                <div class="verbose-div">
                  <div class="dropdown-container">
                    <vscode-label for="verbosity-dropdown">
                      <span class="normal">Output Verbosity</span>
                    </vscode-label>
                    <vscode-single-select id="verbosity-dropdown" position="below" v-model="verbosity">
                      <vscode-option value="off">Off</vscode-option>
                      <vscode-option value="low">Low</vscode-option>
                      <vscode-option value="medium">Medium</vscode-option>
                      <vscode-option value="high">High</vscode-option>
                    </vscode-single-select>
                  </div>
                </div>
                <div class="checkbox-div">
          <vscode-checkbox
            :checked="logToFile"
            @change="logToFile = $event.target.checked"
            form="init-form"
          >
            Log output to a file <br />
            <i>Default path: {{ defaultLogFilePath }}</i>
          </vscode-checkbox>

    <div v-if="logToFile" class="log-to-file-container">
      <!-- Log file path -->
      <vscode-form-group variant="vertical">
        <vscode-label for="log-file-path">
          <span class="normal">Log file path</span>
        </vscode-label>
        <vscode-textfield
          id="log-file-path"
          v-model="logFilePath"
          :placeholder="defaultLogFilePath"
        >
          <vscode-icon
            slot="content-after"
            id="file-explorer"
            name="file"
            action-icon
            @click="openFileExplorer"
          />
        </vscode-textfield>
      </vscode-form-group>
      <div class="checkbox-div">
        <vscode-checkbox
          :checked="logFileAppend"
          @change="logFileAppend = $event.target.checked"
        >
          Append
        </vscode-checkbox>
      </div>

      <!-- Log level -->
      <div class="log-level-div">
        <div class="dropdown-container">
          <vscode-label for="log-level-dropdown">
            <span class="normal">Log level</span>
          </vscode-label>
          <vscode-single-select
            :value="logLevel"
            @change="logLevel = $event.target.value"
            id="log-level-dropdown"
            position="below"
          >
            <vscode-option value="debug">Debug</vscode-option>
            <vscode-option value="info">Info</vscode-option>
            <vscode-option value="warning">Warning</vscode-option>
            <vscode-option value="error">Error</vscode-option>
            <vscode-option value="critical">Critical</vscode-option>
          </vscode-single-select>
        </div>
      </div>
    </div>
    </div>
        <div class="checkbox-div">
          <vscode-checkbox
            :checked="isOverwritten"
            @change="isOverwritten = $event.target.checked"
            form="init-form"
          >
            Overwrite <br />
            <i
              >Overwriting will remove the existing content in the specified
              directory and replace it with the files from the Ansible
              collection.</i
            >
          </vscode-checkbox>
        </div>

                <div class="group-buttons">
                  <vscode-button id="clear-button" form="init-form" secondary @click.prevent="onClear">
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Clear All
                  </vscode-button>
                  <vscode-button id="create-button" form="init-form" @click.prevent="handleCreate" :disabled="!canCreate">
                    <span class="codicon codicon-run-all"></span>
                    &nbsp; Create
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
                    placeholder="Output of the command execution"
                    resize="vertical"
                    readonly
                  >
                  </vscode-textarea>
                </vscode-form-group>

                <div class="group-buttons">
                  <vscode-button id="clear-logs-button" form="init-form" secondary @click.prevent="clearLogs">
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Clear Logs
                  </vscode-button>
                  <vscode-button id="copy-logs-button" form="init-form" secondary @click.prevent="copyLogs">
                    <span class="codicon codicon-copy"></span>
                    &nbsp; Copy Logs
                  </vscode-button>
                  <vscode-button
                    @click.prevent="openLogFile"
                    form="init-form"
                    secondary
                    :disabled="!logFileUrl"
                  >
                    <span class="codicon codicon-open-preview"></span>
                    &nbsp; Open Log File
                  </vscode-button>
                  <vscode-button id="open-folder-button" form="init-form" :disabled="openScaffoldedFolderButtonDisabled" @click.prevent="handleInitOpenScaffoldedFolderClick">
                    <span class="codicon codicon-folder-active"></span>
                    &nbsp; Open Project
                  </vscode-button>
                </div>
            </section>
        </form>

    </body>
</template>