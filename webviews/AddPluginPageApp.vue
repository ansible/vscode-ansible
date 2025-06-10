<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { vscodeApi } from './lightspeed/src/utils';
import "../media/contentCreator/addPluginPageStyle.css";
const homeDir = ref('');
const initPath = ref("");
const pluginNameTextField = ref("");
const collectionPathUrlTextField = ref("");
const isOverwritten = ref(false);
const isCreating = ref(false);
const logs = ref("");
const createButtonDisabled = ref(false);
const logFilePath = ref("");
const defaultLogFilePath = ref("");
const logFileUrl = ref("");
const openLogFileButtonDisabled = ref(true);
const openScaffoldedFolderButtonDisabled = ref(true);
const projectUrl = ref("");
const pluginTypeDropdown = ref("Action");      // 👈 default
const verboseDropdown = ref("Off");            // 👈 default


onMounted(() => {
  window.addEventListener('message', (event) => {
    const message = event.data;

    if (message.type === 'homeDirectory') {
      homeDir.value = message.data;
    } else if (message.type === 'folderSelected') {
      initPath.value = message.data;
    }else if (message.command === 'homedirAndTempdir') {
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
        isCreating.value = false;
      }
    }
  });
  vscodeApi.postMessage({ type: 'ui-mounted' });
});

function openFolderExplorer() {
  vscodeApi.postMessage({
    type: 'openFolderExplorer',
    payload: {
      defaultPath: initPath.value || homeDir.value,
    },
  });
}

function handleInitOpenScaffoldedFolderClick() {
  vscodeApi.postMessage({
    type: "init-open-scaffolded-folder-plugin",
    payload: {
      projectUrl: projectUrl.value,
      pluginName: pluginNameTextField.value.trim(),
      pluginType: pluginTypeDropdown.value.trim(),
    },
  });
}

const canCreate = computed(() => {
  return (
    pluginNameTextField.value.trim() !== ""
  );
});

function clearLogs() {
  logs.value = "";
}

function handleInitCreateClick() {
  isCreating.value = true;
  logs.value = "";
  createButtonDisabled.value = true;
  vscodeApi.postMessage({
    type: "init-create-plugin",
    payload: {
      pluginName: pluginNameTextField.value.trim(),
      pluginType: pluginTypeDropdown.value.trim(),
      collectionPath: initPath.value.trim() || homeDir.value.trim(),
      verbosity: verboseDropdown.value.trim(),
      isOverwritten: isOverwritten.value
    }
  })
}

async function onClear() {
  pluginTypeDropdown.value = "Action";
  pluginNameTextField.value = "";
  initPath.value = "";
  verboseDropdown.value = "Off";
  isOverwritten.value = false;
  logs.value = "";
  isOverwritten.value = false;
  createButtonDisabled.value = false;
  vscodeApi.postMessage({ type: "ui-mounted" });
}

</script>
<template>
<body>
  <div class="title-div">
    <h1>Add a plugin to an existing collection</h1>
    <p class="subtitle">Extending automation with python</p>
  </div>

  <form id="init-form">
    <section class="component-container">

      <vscode-form-group variant="vertical">
        <vscode-label for="path-url">
          <span class="normal">Collection root directory *</span>
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

      <div class="plugin-type-div">
        <div class="dropdown-container">
          <vscode-label for="plugin-dropdown">
            <span class="normal">Plugin type *</span>
          </vscode-label>
          <vscode-single-select id="plugin-dropdown" v-model="pluginTypeDropdown">
            <vscode-option>Action</vscode-option>
            <vscode-option>Filter</vscode-option>
            <vscode-option>Lookup</vscode-option>
            <vscode-option>Module</vscode-option>
            <vscode-option>Test</vscode-option>
          </vscode-single-select>

        </div>
      </div>

      <div class="plugin-name-div">
        <vscode-form-group variant="vertical">
          <vscode-label for="plugin-name">
            <span class="normal">Plugin name *</span>
          </vscode-label>
          <vscode-textfield
            id="plugin-name"
            form="init-form"
            placeholder="Enter plugin name"
            size="512"
            v-model="pluginNameTextField"
          />
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
          <vscode-single-select id="verbosity-dropdown" v-model="verboseDropdown">
            <vscode-option>Off</vscode-option>
            <vscode-option>Low</vscode-option>
            <vscode-option>Medium</vscode-option>
            <vscode-option>High</vscode-option>
          </vscode-single-select>

        </div>
      </div>

      <div class="checkbox-div">
          <vscode-checkbox
            :checked="isOverwritten"
            @change="isOverwritten = $event.target.checked"
            form="init-form"
            id="overwrite-checkbox"
          >
            Overwrite <br />
            <i
              >Overwriting will remove the existing content in the specified
              directory and replace it with the files from the Ansible
              project.</i
            >
          </vscode-checkbox>
        </div>

      <div class="group-buttons">
        <vscode-button id="clear-button" form="init-form" secondary @click.prevent="onClear">
          <span class="codicon codicon-clear-all"></span>
          &nbsp; Clear All
        </vscode-button>
        <vscode-button id="create-button" form="init-form" @click.prevent="handleInitCreateClick" :disabled="!canCreate">
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
        <vscode-button id="open-folder-button" form="init-form" :disabled="openScaffoldedFolderButtonDisabled" @click.prevent="handleInitOpenScaffoldedFolderClick">
          <span class="codicon codicon-go-to-file"></span>
          &nbsp; Open Plugin
        </vscode-button>
      </div>

      <div id="required-fields" class="required-fields">
        <p>Fields marked with an asterisk (*) are required</p>
      </div>

    </section>
  </form>
        </body>
</template>
