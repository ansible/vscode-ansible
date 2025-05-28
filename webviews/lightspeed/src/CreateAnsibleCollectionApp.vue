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
            :placeholder="defaultInitPath || 'Select or enter init path'"
            size="512"
          >
            <vscode-icon
              slot="content-after"
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
            <vscode-label for="log-path-url">
              <span class="normal">Log File Path</span>
            </vscode-label>
            <vscode-textfield
              id="log-path-url"
              class="required"
              v-model="logFilePath"
              :placeholder="defaultLogFilePath || 'Select or enter log file path'"
              size="512"
            >
            <vscode-icon
              slot="content-after"
              id="file-explorer"
              name="file"
              action-icon
            ></vscode-icon>
            </vscode-textfield>
            </vscode-form-group>

          <div class="checkbox-div">
            <vscode-checkbox
              :checked="logAppend"
              @change="logAppend = $event.target.checked"
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
            :checked="overwrite"
            @change="overwrite = $event.target.checked"
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
            :checked="editable"
            @change="editable = $event.target.checked"
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
          <!-- <vscode-button
            ref="initCreateButton"
            @click.prevent="onCreate"
            :disabled="!isFormValid"
            form="init-form"
          >
            <span class="codicon codicon-run-all"></span>
            &nbsp; Create
          </vscode-button> -->
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
            ref="initOpenLogFileButton"
            @click.prevent="openLogs"
            form="init-form"
            secondary
            disabled
          >
            <span class="codicon codicon-open-preview"></span>
            &nbsp; Open Log File
          </vscode-button>
          <vscode-button
            ref="initOpenScaffoldedFolderButton"
            appearance="secondary"
            @click.prevent="handleOpenScaffoldedFolderClick"
            form="init-form"
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
  display: flex;
  flex-direction: column;
  margin-top: 22px;
  margin-bottom: 10px;
  width: 100%;
}
.verbose-div {
  display: flex;
  flex-direction: row;
  margin-top: 12px;
  margin-bottom: 30px;
  width: 100%;
}
.full-collection-name {
  display: flex;
  flex-direction: row;
  color: var(--vscode-descriptionForeground);
}
.group-buttons {
  display: flex;
  flex-direction: row;
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
.clickable-icon {
  cursor: pointer;
  display: flex;
  align-items: center;
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

// Extend the PostMessageEvent type to include all command values in one union
type ExtendedPostMessageEvent = PostMessageEvent & {
  command: "ADEPresence" | "execution-log" | "file-uri" | "disable-build-button" | "enable-build-button" | "enable-open-file-button" | "homedirAndTempdir";
  homedir?: string;
  tempdir?: string;
  arguments?: any;
};

const vscode = acquireVsCodeApi();

// Reactive variables
const namespace = ref("");
const collectionName = ref("");
const initPath = ref("");
const fullCollectionName = ref("");
const verbosity = ref("off");
const logToFile = ref(false);
const logFilePath = ref("");
const logAppend = ref(false);
const logLevel = ref("debug");
const overwrite = ref(false);
const editable = ref(false);
const logs = ref("");
const logFileUrl = ref("");
const collectionUrl = ref("");
const initOpenLogFileButton = ref<HTMLButtonElement | null>(null);
const initOpenScaffoldedFolderButton = ref<HTMLButtonElement | null>(null);
const initCreateButton = ref<HTMLButtonElement | null>(null);
const defaultInitPath = ref("");
const defaultLogFilePath = ref("");
// Watch for changes to namespace and collectionName
watch([namespace, collectionName], () => {
  fullCollectionName.value =
    namespace.value && collectionName.value
      ? `${namespace.value}.${collectionName.value}`
      : "";
});

// Computed property for form validation
const isFormValid = computed(() => {
  return (
    namespace.value.trim() !== "" &&
    collectionName.value.trim() !== "" &&
    (initPath.value.trim() !== "" || defaultInitPath.value.trim() !== "")
  );
});

// Function to open folder explorer
function openFolderExplorer() {
  console.log('Opening folder explorer...'); // Debug log
  vscode.postMessage({
    command: 'open-explorer',
    payload: { selectOption: 'folder' }
  });
}

// Function to open file explorer  
function openFileExplorer() {
  console.log('Opening file explorer...'); // Debug log
  
  vscode.postMessage({
    command: 'open-explorer',
    payload: { selectOption: 'file' }
  });
}

// Create collection function
// function onCreate() {
//   const actualInitPath = initPath.value || defaultInitPath.value;
//   const actualLogFilePath = logFilePath.value || defaultLogFilePath.value;
  
//   vscode.postMessage({
//     type: "init-create",
//     payload: {
//       namespace: namespace.value,
//       name: collectionName.value,
//       initPath: actualInitPath,
//       verbosity: verbosity.value,
//       logToFile: logToFile.value,
//       logFilePath: actualLogFilePath,
//       logAppend: logAppend.value,
//       logLevel: logLevel.value,
//       overwrite: overwrite.value,
//       editable: editable.value,
//       logFileUrl: logFileUrl.value,
//     } as AnsibleCollectionFormInterface,
//   });
// }

// Clear form function
function onClear() {
  namespace.value = "";
  collectionName.value = "";
  initPath.value = "";
  verbosity.value = "off";
  logToFile.value = false;
  logAppend.value = false;
  overwrite.value = false;
  editable.value = false;
  logFilePath.value = "";
  logLevel.value = "debug";
  logs.value = "";
  logFileUrl.value = "";
  collectionUrl.value = "";
  fullCollectionName.value = "";
  vscode.postMessage({ type: "ui-mounted" });
}

// Clear logs function
function clearLogs() {
  logs.value = "";
}

// Copy logs function
function copyLogs() {
  navigator.clipboard.writeText(logs.value);
}

// Open logs function
function openLogs() {
  vscode.postMessage({
    command: "init-open-log-file",
    payload: {
      logFileUrl: logFileUrl.value,
    },
  });
}

// Handle open scaffolded folder click
function handleOpenScaffoldedFolderClick() {
  vscode.postMessage({
    console,
    command: "init-open-scaffolded-folder",
    payload: {
      collectionUrl: collectionUrl.value,
    },
  });
}
//   window.addEventListener(
//     "message",
//     (event: MessageEvent<ExtendedPostMessageEvent>) => {
//       const message = event.data;
      
//       if (message.command === "homedirAndTempdir") {
//         const { homedir, tempdir } = message as { homedir: string; tempdir: string };
//         defaultInitPath.value = `${homedir}/.ansible/collections/ansible_collections`;
//         defaultLogFilePath.value = `${tempdir}/ansible-creator.log`;
//       }

//       if (message.command === "file-uri") {
//         const selectedUri = message.arguments?.selectedUri;
//         if (selectedUri) {
//           console.log('Received file-uri message with:', selectedUri); // Debug log
//           // Determine which field to update based on some context
//           // Since we can't easily track which button was clicked, we'll use a simple approach
//           // If logToFile is true and we don't have a logFilePath, assume it's for log file
//           if (logToFile.value && !logFilePath.value) {
//             logFilePath.value = selectedUri;
//           } else {
//             // Otherwise assume it's for init path
//             initPath.value = selectedUri;
//           }
//         }
//       }

//       switch (message.command) {
//         case "execution-log":
//           logs.value = message.arguments.commandOutput;
//           logFileUrl.value = message.arguments.logFileUrl ?? "";

//           if (logFileUrl.value && initOpenLogFileButton.value) {
//             initOpenLogFileButton.value.disabled = false;
//           } else if (initOpenLogFileButton.value) {
//             initOpenLogFileButton.value.disabled = true;
//           }

//           if (
//             message.arguments.status &&
//             message.arguments.status === "passed" &&
//             initOpenScaffoldedFolderButton.value
//           ) {
//             initOpenScaffoldedFolderButton.value.disabled = false;
//           }

//           collectionUrl.value = message.arguments.collectionUrl ?? "";
//           break;
//       }
//     },
//   );

//   window.parent.postMessage({ command: "ready" }, "*");
// </script>