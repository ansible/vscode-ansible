<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { vscodeApi } from './lightspeed/src/utils';
import {
  useCommonWebviewState,
  openFolderExplorer,
  clearLogs,
  initializeUI,
  setupMessageHandler,
  clearAllFields,
  createActionWrapper,
  createFormValidator} from './../src/features/contentCreator/webviewUtils';
import "../media/contentCreator/addPluginPageStyle.css";
import RequirementsBanner from './RequirementsBanner.vue';

const commonState = useCommonWebviewState();
const homeDir = commonState.homeDir;
const logs = commonState.logs;

const initPath = ref("");
const patternNameTextField = ref("");
const isOverwritten = ref(false);
const openScaffoldedFolderButtonDisabled = ref(true);
const projectUrl = ref("");
const verboseDropdown = ref("Off");

const canCreate = createFormValidator({
  patternName: () => patternNameTextField.value.trim() !== ""
});

const requirementsMet = ref(true);
const requirementFailures = ref([]);

const handleOpenScaffoldedFolder = () => {
  vscodeApi.postMessage({
    type: "init-open-scaffolded-folder-pattern",
    payload: {
      projectUrl: projectUrl.value,
      patternName: patternNameTextField.value.trim(),
    },
  });
};

const handleCreate = createActionWrapper(
  commonState.isCreating,
  commonState.logs,
  commonState.createButtonDisabled,
  () => {
    vscodeApi.postMessage({
      type: "init-add-pattern",
      payload: {
        patternName: patternNameTextField.value.trim(),
        collectionPath: initPath.value.trim() || homeDir.value.trim(),
        isOverwritten: isOverwritten.value
      }
    });
  }
);

const onClear = () => {
  const componentFields = {
    patternNameTextField, initPath, verboseDropdown, isOverwritten
  };
  const defaults = {
    verboseDropdown: "Off",
    isOverwritten: false
  };
  clearAllFields(componentFields, defaults);
  clearAllFields({
    logs: commonState.logs
  });
  commonState.createButtonDisabled.value = false;
  initializeUI();
};

onMounted(() => {
  vscodeApi.postMessage({ type: 'request-requirements-status' });
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'requirements-status') {
      requirementsMet.value = event.data.met;
      requirementFailures.value = event.data.failures || [];
    }
  });
  setupMessageHandler({
    onFolderSelected: (data) => {
      initPath.value = data;
    },
    onExecutionLog: (args) => {
      if (commonState.isCreating.value) {
        openScaffoldedFolderButtonDisabled.value = args.status !== "passed";
        projectUrl.value = args.projectUrl || "";
      }
    }
  }, commonState);
  initializeUI();
});
</script>

<template>
<body>
  <RequirementsBanner v-if="!requirementsMet" :failures="requirementFailures" />
  <div :class="{ 'disabled-content': !requirementsMet }">
  <div class="title-div">
    <h1>Add a pattern to an existing collection</h1>
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
                        @click="openFolderExplorer(initPath || homeDir)"
                        action-icon
                      ></vscode-icon>
                    </vscode-textfield>
        </vscode-form-group>

        <div class="pattern-name-div">
          <vscode-form-group variant="vertical">
            <vscode-label for="pattern-name">
              <span class="normal">Pattern name *</span>
            </vscode-label>
            <vscode-textfield
              id="pattern-name"
              form="init-form"
              placeholder="Enter pattern name"
              size="512"
              v-model="patternNameTextField"
            />
          </vscode-form-group>
        </div>

        <div id="full-collection-path" class="full-collection-path">
          <p>Project path: {{ initPath || homeDir }}</p>
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
          <vscode-button id="clear-logs-button" form="init-form" secondary @click.prevent="clearLogs(commonState.logs)">
            <span class="codicon codicon-clear-all"></span>
            &nbsp; Clear Logs
          </vscode-button>
          <vscode-button id="open-folder-button" form="init-form" :disabled="openScaffoldedFolderButtonDisabled" @click.prevent="handleOpenScaffoldedFolder">
            <span class="codicon codicon-go-to-file"></span>
            &nbsp; Open Pattern
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

<style>
.disabled-content { opacity: 0.4; pointer-events: none; }
</style>
