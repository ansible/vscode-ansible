<template>
  <div class="container">
    <div class="title-div">
      <h1>Create new Ansible collection</h1>
      <p class="subtitle">Streamlining automation</p>
    </div>

    <form id="init-form">
      <section class="component-container">
        <vscode-form-group variant="vertical">
          <vscode-label for="namespace-name">
            <span class="normal">Namespace</span><sup>*</sup>
          </vscode-label>
          <vscode-textfield
            id="namespace-name"
            v-model="namespace"
            placeholder="Enter namespace name"
          />
        </vscode-form-group>

        <vscode-form-group variant="vertical">
          <vscode-label for="collection-name">
            <span class="normal">Collection</span><sup>*</sup>
          </vscode-label>
          <vscode-textfield
            id="collection-name"
            v-model="collectionName"
            placeholder="Enter collection name"
          />
        </vscode-form-group>

        <div v-if="fullCollectionName" class="full-collection-name">
          <p>
            Collection name:&nbsp;<b>{{ fullCollectionName }}</b>
          </p>
        </div>

        <vscode-form-group variant="vertical">
          <vscode-label for="path-url">
            <span class="normal">Init path</span>
          </vscode-label>
          <vscode-textfield
            id="path-url"
            :value="initPath"
            readonly
            placeholder="${homeDir}/.ansible/collections/ansible_collections"
          >
            <vscode-icon
              slot="content-after"
              name="folder-opened"
              action-icon
            />
          </vscode-textfield>
        </vscode-form-group>

        <div v-if="initPath" class="full-collection-name">
          <p>
            Project path:&nbsp;<b>{{ initPath }}/{{ fullCollectionName }}</b>
          </p>
        </div>

        <div class="verbose-div">
          <div class="dropdown-container">
            <vscode-label for="verbosity-dropdown">
              <span class="normal">Verbosity</span>
            </vscode-label>
            <vscode-single-select
              id="verbosity-dropdown"
              v-model="verbosity"
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
          <vscode-checkbox v-model="logToFile" @change="toggleLogOptions">
            Log output to a file<br />
            <i>Default path: ${tempDir}/ansible-creator.log.</i>
          </vscode-checkbox>
        </div>

        <div id="log-to-file-options-div" v-show="logToFile">
          <vscode-form-group variant="vertical">
            <vscode-label for="log-file-path">
              <span class="normal">Log file path</span>
            </vscode-label>
            <vscode-textfield
              id="log-file-path"
              v-model="logFilePath"
              placeholder="${tempDir}/ansible-creator.log"
            >
              <vscode-icon slot="content-after" name="file" action-icon />
            </vscode-textfield>
          </vscode-form-group>

          <vscode-checkbox v-model="logAppend">Append</vscode-checkbox>

          <div class="log-level-div">
            <div class="dropdown-container">
              <vscode-label for="log-level-dropdown">
                <span class="normal">Log level</span>
              </vscode-label>
              <vscode-single-select
                id="log-level-dropdown"
                v-model="logLevel"
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
          <vscode-checkbox v-model="overwrite">
            Overwrite<br />
            <i
              >Overwriting will remove the existing content in the specified
              directory and replace it with the files from the Ansible
              collection.</i
            >
          </vscode-checkbox>
        </div>

        <div class="checkbox-div">
          <vscode-checkbox v-model="editable">
            Install collection from source code (editable mode)<br />
            <i
              >This will allow immediate reflection of content changes without
              having to reinstalling it.<br />
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
          <vscode-button appearance="secondary" @click.prevent="onClear">
            <span class="codicon codicon-clear-all"></span>&nbsp; Clear All
          </vscode-button>
          <vscode-button @click.prevent="onCreate">
            <span class="codicon codicon-run-all"></span>&nbsp; Create
          </vscode-button>
        </div>

        <vscode-divider />

        <vscode-label id="vscode-logs-label" for="log-text-area">
          <span class="normal">Logs</span>
        </vscode-label>
        <vscode-textarea
          id="log-text-area"
          v-model="logs"
          cols="90"
          rows="10"
          resize="vertical"
          readonly
          placeholder="Output of the command execution"
        />

        <div class="group-buttons">
          <vscode-button appearance="secondary" @click="clearLogs">
            <span class="codicon codicon-clear-all"></span>&nbsp; Clear Logs
          </vscode-button>
          <vscode-button appearance="secondary" @click="copyLogs">
            <span class="codicon codicon-copy"></span>&nbsp; Copy Logs
          </vscode-button>
          <vscode-button appearance="secondary" :disabled="true">
            <span class="codicon codicon-open-preview"></span>&nbsp; Open Log
            File
          </vscode-button>
          <vscode-button :disabled="true">
            <span class="codicon codicon-folder-active"></span>&nbsp; Open
            Collection
          </vscode-button>
        </div>
      </section>
    </form>
  </div>
</template>

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

import {
  AnsibleCollectionFormInterface,
  PostMessageEvent,
} from "../../../src/features/contentCreator/types";
import { ref, onMounted, watch } from "vue";
import { vscodeApi } from "./utils";

const vscode = acquireVsCodeApi();

const namespace = ref("");
const collectionName = ref("");
const initPath = ref("${homeDir}/.ansible/collections/ansible_collections");
const fullCollectionName = ref("");
const verbosity = ref("off");
const logToFile = ref(false);
const logFilePath = ref("${tempDir}/ansible-creator.log");
const logAppend = ref(false);
const logLevel = ref("info");
const overwrite = ref(false);
const editable = ref(false);
const logs = ref("");

watch([namespace, collectionName], () => {
  fullCollectionName.value =
    namespace.value && collectionName.value
      ? `${namespace.value}.${collectionName.value}`
      : "";
});

function onCreate() {
  vscode.postMessage({
    type: "create",
    payload: {
      namespace: namespace.value,
      name: collectionName.value,
      verbosity: verbosity.value,
      logToFile: logToFile.value,
      logFilePath: logFilePath.value,
      logAppend: logAppend.value,
      logLevel: logLevel.value,
      overwrite: overwrite.value,
      editable: editable.value,
    },
  });
}

function onClear() {
  namespace.value = "";
  collectionName.value = "";
  logToFile.value = false;
  logFilePath.value = "${tempDir}/ansible-creator.log";
  logAppend.value = false;
  logLevel.value = "info";
  verbosity.value = "off";
  overwrite.value = false;
  editable.value = false;
  logs.value = "";
}

function clearLogs() {
  logs.value = "";
}

function copyLogs() {
  navigator.clipboard.writeText(logs.value);
}
</script>

<style scoped>
@import url(../../../media/baseStyles/baseFormStyle.css);

.container {
  max-width: 960px;
  margin-left: auto;
  margin-right: auto;
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
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
  width: 700px;
  height: 200px;
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

#log-to-file-options-div {
  display: none;
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
