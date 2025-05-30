<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { vscodeApi } from './utils';

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


function openFolderExplorer() {
  vscodeApi.postMessage({
    type: 'openFolderExplorer',
  });
}

function openFileExplorer() {
  vscodeApi.postMessage({
    type: 'openFileExplorer',
  });
}
// fetch home directory after component is mounted
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
    }
  });

  vscodeApi.postMessage({ type: 'ui-mounted' });
});

function handleCreate() {
  const payload = {
    type: 'initCollectionCreate',
    data: {
      namespace: namespace.value,
      collectionName: collectionName.value,
      initPath: initPath.value,
      verbosity: verbosity.value,
      logToFile: logToFile.value,
      logFileAppend: logFileAppend.value,
      isOverwritten: isOverwritten.value,
      isEditableModeInstall: isEditableModeInstall.value,
      logFilePath: logFilePath.value || defaultLogFilePath.value,
      logLevel: logLevel.value,
    },
  };

  vscodeApi.postMessage(payload);
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
  console.log("Form cleared",namespace.value);
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
                  <p>Project path:&nbsp</p>
                </div>
                <div class="verbose-div">
                  <div class="dropdown-container">
                    <vscode-label for="verbosity-dropdown">
                      <span class="normal">Output Verbosity</span>
                    </vscode-label>
                    <vscode-single-select id="verbosity-dropdown" position="below">
                      <vscode-option>Off</vscode-option>
                      <vscode-option>Low</vscode-option>
                      <vscode-option>Medium</vscode-option>
                      <vscode-option>High</vscode-option>
                    </vscode-single-select>
                  </div>
                </div>
                <div class="checkbox-div">
                    <vscode-checkbox id="log-to-file-checkbox" form="init-form">Log output to a file <br><i>Default path: {{defaultLogFilePath}}</i></vscode-checkbox>
                </div>
                <div id="log-to-file-options-div">
                  <vscode-form-group variant="vertical">
                    <vscode-label for="log-file-path">
                      <span class="normal">Log file path</span>
                    </vscode-label>
                    <vscode-textfield id="log-file-path" class="required" form="init-form"  :placeholder="defaultLogFilePath" v-model="logFilePath"
                      size="512">
                      <vscode-icon
                      slot="content-after"
                      id="file-explorer"
                      name="file"
                      @click="openFileExplorer"
                      action-icon
                    ></vscode-icon>
                    </vscode-textfield>
                  </vscode-form-group>

                  <vscode-checkbox id="log-file-append-checkbox" form="init-form">Append</vscode-checkbox>

                  <div class="log-level-div">
                    <div class="dropdown-container">
                      <vscode-label for="log-level-dropdown">
                        <span class="normal">Log level</span>
                      </vscode-label>
                      <vscode-single-select id="log-level-dropdown" position="below">
                        <vscode-option>Debug</vscode-option>
                        <vscode-option>Info</vscode-option>
                        <vscode-option>Warning</vscode-option>
                        <vscode-option>Error</vscode-option>
                        <vscode-option>Critical</vscode-option>
                      </vscode-single-select>
                    </div>
                  </div>

                </div>
                <div class="checkbox-div">
                  <vscode-checkbox id="overwrite-checkbox" form="init-form">Overwrite <br><i>Overwriting will remove the existing content in the specified directory and replace it with the files from the Ansible project.</i></vscode-checkbox>
                </div>

                <div class="group-buttons">
                  <vscode-button id="clear-button" form="init-form" secondary @click.prevent="onClear">
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Clear All
                  </vscode-button>
                  <vscode-button id="create-button" form="init-form" @click.prevent="handleCreate">
                    <span class="codicon codicon-run-all"></span>
                    &nbsp; Create
                  </vscode-button>
                </div>

                <vscode-divider></vscode-divider>

                <vscode-label id="vscode-logs-label" for="log-text-area">
                  <span class="normal">Logs</span>
                </vscode-label>

                <vscode-textarea id="log-text-area" cols="90" rows="10" placeholder="Output of the command execution"
                  resize="vertical" readonly></vscode-textarea>

                <div class="group-buttons">
                  <vscode-button id="clear-logs-button" form="init-form" secondary>
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Clear Logs
                  </vscode-button>
                  <vscode-button id="copy-logs-button" form="init-form" secondary>
                    <span class="codicon codicon-copy"></span>
                    &nbsp; Copy Logs
                  </vscode-button>
                  <vscode-button id="open-log-file-button" form="init-form" secondary disabled>
                    <span class="codicon codicon-open-preview"></span>
                    &nbsp; Open Log File
                  </vscode-button>
                  <vscode-button id="open-folder-button" form="init-form" disabled>
                    <span class="codicon codicon-folder-active"></span>
                    &nbsp; Open Project
                  </vscode-button>
                </div>
            </section>
        </form>

    </body>
</template>