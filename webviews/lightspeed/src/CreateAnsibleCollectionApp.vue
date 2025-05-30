<template>
  <body>
    <div class="title-div">
      <h1>Create new Ansible collection</h1>
      <p class="subtitle">Streamlining automation</p>
    </div>

    <form id="init-form">
      <section class="component-container">
        <vscode-form-group variant="vertical">
          <vscode-label for="namespace-name">
            <span class="normal">Namespace</span>
            <sup>*</sup>
          </vscode-label>
          <vscode-textfield
            id="namespace-name"
            v-model="namespace"
            class="required"
            form="init-form"
            placeholder="Enter namespace name"
          >
          </vscode-textfield>
        </vscode-form-group>

        <vscode-form-group variant="vertical">
          <vscode-label for="collection-name">
            <span class="normal">Collection</span>
            <sup>*</sup>
          </vscode-label>
          <vscode-textfield
            id="collection-name"
            v-model="collectionName"
            class="required"
            form="init-form"
            placeholder="Enter collection name"
            size="512"
          >
          </vscode-textfield>
        </vscode-form-group>

        <div id="full-collection-name" class="full-collection-name">
          <p>
            Collection name:&nbsp;
            <b>
              {{ namespace || "namespace" }}.{{
                collectionName || "collection"
              }}
            </b>
          </p>
        </div>

        <vscode-form-group variant="vertical">
          <vscode-label for="path-url">
            <span class="normal">Init path</span>
          </vscode-label>
          <vscode-textfield
            id="path-url"
            class="required"
            v-model="initPath"
            :placeholder="defaultInitPath"
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

        <div id="full-collection-path" class="full-collection-name">
          <p>
            Project path:&nbsp;<b
              >{{ initPath || defaultInitPath }}/{{ fullCollectionName }}</b
            >
          </p>
        </div>

        <div class="verbose-div">
          <div class="dropdown-container">
            <vscode-label for="verbosity-dropdown">
              <span class="normal">Verbosity</span>
            </vscode-label>
            <vscode-single-select
              :value="verbosity"
              @change="verbosity = $event.target.value"
              id="verbosity-dropdown"
              position="below"
            >
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
        </div>

        <div v-if="logToFile" class="log-to-file-options">
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

        <div class="checkbox-div">
          <vscode-checkbox
            :checked="isEditableModeInstall"
            @change="isEditableModeInstall = $event.target.checked"
            form="init-form"
          >
            Install collection from source code (editable mode) <br />
            <i
              >This will allow immediate reflection of content changes without
              having to reinstalling it. <br />
              (NOTE: Requires ansible-dev-environment installed in the
              environment.)</i
            >
          </vscode-checkbox>
          <a
            id="ade-docs-link"
            href="https://ansible.readthedocs.io/projects/dev-environment/"
            >Learn more</a
          >
        </div>

        <div class="group-buttons">
          <vscode-button
            @click.prevent="onClear"
            form="init-form"
            appearance="secondary"
          >
            <span class="codicon codicon-clear-all"></span>&nbsp; Clear All
          </vscode-button>
          <vscode-button
            ref="initCreateButton"
            @click.prevent="onCreate"
            :disabled="!isFormValid"
            form="init-form"
          >
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
          <vscode-button @click.prevent="clearLogs" form="init-form" secondary>
            <span class="codicon codicon-clear-all"></span>
            &nbsp; Clear Logs
          </vscode-button>
          <vscode-button @click.prevent="copyLogs" form="init-form" secondary>
            <span class="codicon codicon-copy"></span>
            &nbsp; Copy Logs
          </vscode-button>
          <vscode-button
            @click.prevent="openLogs"
            form="init-form"
            secondary
            :disabled="!logFileUrl"
          >
            <span class="codicon codicon-open-preview"></span>
            &nbsp; Open Log File
          </vscode-button>
          <vscode-button
            ref="initOpenScaffoldedFolderButton"
            appearance="secondary"
            @click.prevent="handleOpenScaffoldedFolderClick"
            form="init-form"
            :disabled="!collectionUrl"
          >
            <span class="codicon codicon-folder-active"></span>
            &nbsp; Open Collection
          </vscode-button>
        </div>
      </section>
    </form>
  </body>
</template>

<style scoped>
@import url(../../../media/baseStyles/baseFormStyle.css);
.container {
  display: flex;
  flex-direction: column;
  font-size: 1em;
}
.element {
  margin-bottom: 14px;
}
vscode-textfield {
  margin-bottom: 6px;
  width: 100%;
}
vscode-textarea {
  margin-top: 6px;
  margin-bottom: 6px;
}
vscode-form-group {
  width: 100%;
  margin: 0;
}
vscode-divider {
  width: 100%;
}
#vscode-logs-label {
  padding: 0;
  align-self: flex-start;
  margin-left: 5px;
}
#log-text-area {
  width: 650px;
  height: 156px;
  resize: vertical;
}
.checkbox-div {
  display: flex; /* Use flexbox */
  flex-direction: column; /* Arrange child elements vertically */
  margin-top: 22px;
  margin-bottom: 10px;
  width: 100%;
}
.verbose-div {
  display: flex; /* Use flexbox */
  flex-direction: row; /* Arrange child elements vertically */
  margin-top: 12px;
  margin-bottom: 30px;
  width: 100%;
}
.full-collection-name {
  display: flex; /* Use flexbox */
  flex-direction: row; /* Arrange child elements vertically */
  color: var(--vscode-descriptionForeground);
}
.group-buttons {
  display: flex; /* Use flexbox */
  flex-direction: row; /* Arrange child elements vertically */
}
vscode-button {
  margin: 0px 3px;
}
vscode-checkbox i {
  color: var(--vscode-descriptionForeground);
  font-size: small;
}
vscode-single-select {
  width: 200px;
}
#ade-docs-link {
  margin-left: 30px;
  font-style: italic;
}
.dropdown-container {
  box-sizing: border-box;
  display: flex;
  flex-flow: column nowrap;
  align-items: flex-start;
  justify-content: flex-start;
}
.dropdown-container label {
  display: block;
  color: var(--vscode-foreground);
  cursor: pointer;
  font-size: var(--vscode-font-size);
  line-height: normal;
  margin-bottom: 2px;
}
.log-to-file-options {
  display: flex;
  width: 100%;
  flex-direction: column;
  border-style: dotted;
  border-color: var(--focus-border);
  border-width: 0.5px;
  padding: 8px;
}
.log-level-div {
  margin: 4px 0px;
}
</style>

<script setup lang="ts">
import "@vscode-elements/elements";
import {
  VscodeButton,
  VscodeCheckbox,
  VscodeIcon,
  VscodeLabel,
  VscodeSingleSelect,
  VscodeTextarea,
  VscodeTextfield,
} from "@vscode-elements/elements";

import { ref, onMounted, watch, computed } from "vue";
import { vscodeApi } from "./utils";
import {
  AnsibleCollectionFormInterface,
  PostMessageEvent,
} from "../../../src/features/contentCreator/types";

const vscode = acquireVsCodeApi();

const namespace = ref("");
const collectionName = ref("");
const initPath = ref("");
const fullCollectionName = ref("");
const verbosity = ref("off");
const logToFile = ref(false);
const logFilePath = ref("");
const logFileAppend = ref(false);
const logLevel = ref("debug");
const isOverwritten = ref(false);
const isEditableModeInstall = ref(false);
const logs = ref("");
const logFileUrl = ref("");
const collectionUrl = ref("");
const initOpenLogFileButton = ref<HTMLButtonElement | null>(null);
const initOpenScaffoldedFolderButton = ref<HTMLButtonElement | null>(null);
const initCreateButton = ref<HTMLButtonElement | null>(null);
const defaultInitPath = ref("");
const defaultLogFilePath = ref("");

// Track which explorer action was last triggered
let lastExplorerAction = ref<'folder' | 'file'>('folder');

watch([namespace, collectionName], () => {
  fullCollectionName.value =
    namespace.value && collectionName.value
      ? `${namespace.value}.${collectionName.value}`
      : "";
});

const isFormValid = computed(() => {
  return (
    namespace.value.trim() !== "" &&
    collectionName.value.trim() !== "" &&
    (initPath.value.trim() !== "" || defaultInitPath.value.trim() !== "")
  );
});

async function openFolderExplorer() {
  lastExplorerAction.value = 'folder';
  vscode.postMessage({
    command: 'open-explorer',
    payload: { selectOption: "folder" }
  });
}

async function openFileExplorer() {
  lastExplorerAction.value = 'file';
  vscode.postMessage({
    command: 'open-explorer',
    payload: { selectOption: "file" }
  });
}

async function onCreate() {
  const actualInitPath = initPath.value || defaultInitPath.value;
  const actualLogFilePath = logFilePath.value || defaultLogFilePath.value;

  // Disable the create button during execution
  if (initCreateButton.value) {
    initCreateButton.value.disabled = true;
}
  vscode.postMessage({
    command: "init-create",
    payload: {
      namespaceName: namespace.value,
      collectionName: collectionName.value,
      initPath: actualInitPath,
      verbosity: verbosity.value,
      logToFile: logToFile.value,
      logFilePath: actualLogFilePath,
      logFileAppend: logFileAppend.value,
      logLevel: logLevel.value,
      isOverwritten: isOverwritten.value,
      isEditableModeInstall: isEditableModeInstall.value,
      logFileUrl: logFileUrl.value,
    } as AnsibleCollectionFormInterface,
  });
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
  vscode.postMessage({ type: "ui-mounted" });
}

function clearLogs() {
  logs.value = "";
}

async function copyLogs() {
  vscode.postMessage({
    command: "init-copy-logs",
    payload: {
      initExecutionLogs: logs.value,
    },
  });
}

onMounted(() => {
  vscode.postMessage({ type: "ui-mounted" });
  window.addEventListener(
    "message",
    (event: MessageEvent<PostMessageEvent>) => {
      const message = event.data;
      // if (message.command === "homedirAndTempdir") {
      //   defaultInitPath.value = `${message.homedir}/.ansible/collections/ansible_collections`;
      //   defaultLogFilePath.value = `${message.tempdir}/ansible-creator.log`;
      // }

      switch (message.command) {

        case "homedirAndTempdir":
        defaultInitPath.value = `${message.homedir}/.ansible/collections/ansible_collections`;
        defaultLogFilePath.value = `${message.tempdir}/ansible-creator.log`;
        if (!initPath.value) {
          initPath.value = defaultInitPath.value;
        }
        if (!logFilePath.value) {
          logFilePath.value = defaultLogFilePath.value;
        }
        break;

        case "file-uri":
        const selectedUri = message.arguments?.selectedUri;
        if (selectedUri) {
          if (lastExplorerAction.value === 'folder') {
            initPath.value = selectedUri;
          } else if (lastExplorerAction.value === 'file') {
            logFilePath.value = selectedUri;
          }
        }
        break;

        case "execution-log":
          logs.value = message.arguments.commandOutput;
          logFileUrl.value = message.arguments.logFileUrl ?? "";
          if (logFileUrl.value) {
            initOpenLogFileButton.value!.disabled = false;
          } else {
            initOpenLogFileButton.value!.disabled = true;
          }
          if (
            message.arguments.status &&
            message.arguments.status === "passed"
          ) {
            initOpenScaffoldedFolderButton.value!.disabled =
              message.arguments.status === "passed" ? false : true;
          }
          collectionUrl.value = message.arguments.collectionUrl ?? "";
          initCreateButton.disabled = false;
          return;
          break;

          case "ADEPresence":
      }
    },
  );

  window.parent.postMessage({ command: "ready" }, "*");
});

async function openLogs() {
  vscode.postMessage({
    command: "init-open-log-file",
    payload: {
      logFileUrl: logFileUrl.value,
    },
  });
}

async function handleOpenScaffoldedFolderClick() {
  vscode.postMessage({
    command: "init-open-scaffolded-folder",
    payload: {
      collectionUrl: collectionUrl.value,
    },
  });
}
</script>
