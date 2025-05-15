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

import { AnsibleCollectionFormInterface, PostMessageEvent } from "../../../src/features/contentCreator/types";

import { useTemplateRef, onMounted, watch } from "vue";

import { vscodeApi } from './utils';


// Need to refactor the commented section below to use the Vite JS structure

// const initNamespaceNameTextField = useTemplateRef("namespace-name-textfield");
// const initCollectionNameTextField = useTemplateRef("collection-name-textfield");
// const initPathUrlTextField = useTemplateRef("path-url-textfield");
// const folderExplorerIcon = useTemplateRef("folder-explorer-icon");
// const overwriteCheckbox = useTemplateRef("overwrite-checkbox");
// const editableModeInstall = useTemplateRef("editable-mode-checkbox");
// const logToFileCheckbox = useTemplateRef("log-to-file-checkbox");
// const logToFileOptionsDiv = useTemplateRef("log-to-file-options-div");
// const logFilePath = useTemplateRef("log-file-path");
// const fileExplorerButton = useTemplateRef("file-explorer-icon");
// const logFileAppendCheckbox = useTemplateRef("log-file-append-checkbox");
// const logLevelDropdown = useTemplateRef("log-level-dropdown");
// const verboseDropdown = useTemplateRef("verbosity-dropdown");
// const initCreateButton = useTemplateRef("create-button");
// const initClearButton = useTemplateRef("clear-button");
// const initLogsTextArea = useTemplateRef("log-text-area");
// const initClearLogsButton = useTemplateRef("clear-logs-button");
// const initOpenLogFileButton = useTemplateRef("open-log-file-button");
// const initCopyLogsButton = useTemplateRef("copy-logs-button");
// const initOpenScaffoldedFolderButton = useTemplateRef("open-folder-button");

// let logFileUrl = "";
// let collectionUrl = "";

// onMounted(() => {
//   // Safe to use without null check now
//   function toggleCreateButton() {
//   //   update collection name and project path <p> tags

//     const namespaceName = initNamespaceNameTextField.value?.value.trim();
//     const collectionName = initCollectionNameTextField.value?.value.trim();
//     const pathUrl = initPathUrlTextField.value?.value.trim();
//     const placeholderPath = initPathUrlTextField.value?.placeholder as string;

//     const namespaceOrCollectionHasValue = namespaceName || collectionName;

//     // if (!namespaceOrCollectionHasValue) {
//     //     initCollectionNameElement.innerHTML = "namespace.collection";
//     //     initCollectionPathElement.innerHTML = pathUrl || placeholderPath;
//     // } else if (!pathUrl) {
//     //     initCollectionNameElement.innerHTML = `${namespaceName}.${collectionName}`;
//     //     initCollectionPathElement.innerHTML = `${
//     //     placeholderPath
//     //     }/${namespaceName}/${collectionName}`;
//     // } else {
//     //     initCollectionPathElement.innerHTML = pathUrl;
//     //     initCollectionNameElement.innerHTML = `${namespaceName}.${collectionName}`;
//     // }

//     if (
//         initNamespaceNameTextField.value?.value.trim() &&
//         initCollectionNameTextField.value?.value.trim()
//     ) {
//         initCreateButton.value!.disabled = false;
//     } else {
//         initCreateButton.value!.disabled = true;
//     }
//     }

//     function handleInitClearLogsClick() {
//         initNamespaceNameTextField.value!.value = "";
//     }

//     function handleInitOpenLogFileClick() {
//       vscodeApi.postMessage({
//           command: "init-open-log-file",
//           payload: {
//           logFileUrl: logFileUrl,
//           },
//       });
//     }

//     function handleInitCopyLogsClick() {
//       vscodeApi.postMessage({
//         command: "init-copy-logs",
//         payload: {
//         initExecutionLogs: initLogsTextArea.value,
//         },
//       });
//     }

//     function handleInitOpenScaffoldedFolderClick() {
//       vscodeApi.postMessage({
//         command: "init-open-scaffolded-folder",
//         payload: {
//         collectionUrl: collectionUrl,
//         },
//       });
//     }
//     function handleInitCreateClick() {
//         initCreateButton.value!.disabled = true;

//         vscodeApi.postMessage({
//             command: "init-create",
//             payload: {
//             namespaceName: initNamespaceNameTextField.value?.value.trim(),
//             collectionName: initCollectionNameTextField.value?.value.trim(),
//             initPath: initPathUrlTextField.value?.value.trim(),
//             verbosity: verboseDropdown.value?.value.trim(),
//             logToFile: logToFileCheckbox.value?.checked,
//             logFilePath: logFilePath.value?.value.trim(),
//             logFileAppend: logFileAppendCheckbox.value?.checked,
//             logLevel: logLevelDropdown.value?.value.trim(),
//             isOverwritten: overwriteCheckbox.value?.checked,
//             isEditableModeInstall: editableModeInstall.value?.checked,
//             } as AnsibleCollectionFormInterface,
//         });

//         window.addEventListener(
//             "message",
//             async (event: MessageEvent<PostMessageEvent>) => {
//             const message = event.data;

//             switch (message.command) {
//                 case "execution-log":
//                 initLogsTextArea.value!.value = message.arguments.commandOutput;
//                 logFileUrl = message.arguments.logFileUrl;

//                 if (logFileUrl) {
//                     initOpenLogFileButton.value!.disabled = false;
//                 } else {
//                     initOpenLogFileButton.value!.disabled = true;
//                 }

//                 if (
//                     message.arguments.status &&
//                     message.arguments.status === "passed"
//                 ) {
//                     initOpenScaffoldedFolderButton.value!.disabled = false;
//                 } else {
//                     initOpenScaffoldedFolderButton.value!.disabled = true;
//                 }

//                 collectionUrl = message.arguments.collectionUrl
//                     ? message.arguments.collectionUrl
//                     : "";

//                 initCreateButton.value!.disabled = false;

//                 return;
//             }
//             },
//         );
//         }
// });

// watch(() => logToFileCheckbox.value, (checkbox) => {
//   if (checkbox && checkbox.checked){

//   }
// })

// function toggleLogToFileOptions() {
//   if (logToFileCheckbox.value?.checked) {
//     if (
//       logToFileOptionsDiv.value?.style.display === "" ||
//       logToFileOptionsDiv.value?.style.display === "none"
//     ) {
//       logToFileOptionsDiv.value.style.display = "flex";
//     }
//   } else {
//     if (logToFileOptionsDiv.value?.style.display === "flex") {
//       logToFileOptionsDiv.value.style.display = "none";
//     }
//   }
// }


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
                <vscode-label for="namespace-name">
                  <span class="normal">Namespace</span>
                  <sup>*</sup>
                </vscode-label>
                <vscode-textfield
                  ref="namespace-name-textfield"
                  id="namespace-name"
                  name="namespace"
                  form="init-form"
                  placeholder="Enter namespace name">
                </vscode-textfield>
            </vscode-form-group>

            <vscode-form-group variant="vertical">
                <vscode-label for="collection-name">
                  <span class="normal">Collection</span>
                  <sup>*</sup>
                </vscode-label>
                <vscode-textfield
                  ref="collection-name-textfield"
                  id="collection-name"
                  form="init-form"
                  placeholder="Enter collection name"
                  size="512">
                </vscode-textfield>
            </vscode-form-group>

            <div id="full-collection-name" class="full-collection-name">
                <p>Collection name:&nbsp</p>
            </div>

            <vscode-form-group variant="vertical">
                <vscode-label for="path-url">
                  <span class="normal">Init path</span>
                </vscode-label>
                <vscode-textfield
                  ref="path-url-textfield"
                  id="path-url"
                  class="required"
                  form="init-form"
                  placeholder="${homeDir}/.ansible/collections/ansible_collections"
                  size="512">
                <vscode-icon
                  ref="folder-explorer-icon"
                  slot="content-after"
                  name="folder-opened"
                  action-icon
                ></vscode-icon>
                </vscode-textfield>
            </vscode-form-group>

            <div id="full-collection-path" class="full-collection-name">
                <p>Project path:&nbsp</p>
            </div>

            <div class="verbose-div">
                <div class="dropdown-container">
                <vscode-label for="verbosity-dropdown">
                    <span class="normal">Verbosity</span>
                </vscode-label>
                <vscode-single-select
                  ref="verbosity-dropdown"
                  id="verbosity-dropdown"
                  position="below">
                    <vscode-option>Off</vscode-option>
                    <vscode-option>Low</vscode-option>
                    <vscode-option>Medium</vscode-option>
                    <vscode-option>High</vscode-option>
                </vscode-single-select>
                </div>
            </div>

            <div class="checkbox-div">
                <vscode-checkbox
                  ref="log-to-file-checkbox"
                  form="init-form">Log output to a file <br><i>Default path:
                    ${tempDir}/ansible-creator.log.</i>
                </vscode-checkbox>
            </div>

            <div id="log-to-file-options-div" ref="log-to-file-options-div">
              <vscode-form-group variant="vertical">
                <vscode-label
                  for="log-file-path">
                  <span class="normal">Log file path</span>
                </vscode-label>
                <vscode-textfield
                  ref="log-file-path"
                  id="log-file-path"
                  class="required"
                  form="init-form"
                  placeholder="${tempDir}/ansible-creator.log"
                  size="512">
                  <vscode-icon
                    ref="file-explorer-icon"
                    slot="content-after"
                    name="file"
                    action-icon
                  ></vscode-icon>
                </vscode-textfield>
              </vscode-form-group>

                <vscode-checkbox
                  ref="log-file-append-checkbox"
                  form="init-form">Append
                </vscode-checkbox>

                <div class="log-level-div">
                  <div class="dropdown-container">
                    <vscode-label for="log-level-dropdown">
                      <span class="normal">Log level</span>
                    </vscode-label>
                    <vscode-single-select
                      ref="log-level-dropdown"
                      id="log-level-dropdown"
                      position="below">
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
                <vscode-checkbox
                  ref="overwrite-checkbox"
                  form="init-form">Overwrite <br><i>Overwriting will remove the existing content in the specified directory and replace it with the files from the Ansible collection.</i>
                </vscode-checkbox>
            </div>

            <div class="checkbox-div">
                <vscode-checkbox
                  ref="editable-mode-checkbox"
                  form="init-form">Install collection from source code (editable mode) <br><i>This will
                allow immediate reflection of content changes without having to reinstalling it. <br>
                (NOTE: Requires ansible-dev-environment installed in the environment.)</i>
                </vscode-checkbox>
                <a id="ade-docs-link" href="https://ansible.readthedocs.io/projects/dev-environment/">Learn more</a>
            </div>

            <div class="group-buttons">
                <vscode-button
                  ref="clear-button"
                  form="init-form" secondary>
                  <span class="codicon codicon-clear-all"></span>
                &nbsp; Clear All
                </vscode-button>
                <vscode-button
                  ref="create-button"
                  form="init-form">
                  <span class="codicon codicon-run-all"></span>
                &nbsp; Create
                </vscode-button>
            </div>

            <vscode-divider></vscode-divider>
            <vscode-form-group variant="vertical">
                <vscode-label
                  id="vscode-logs-label"
                  for="log-text-area">
                  <span class="normal">Logs</span>
                </vscode-label>
                <vscode-textarea
                  ref="log-text-area"
                  id="log-text-area"
                  placeholder="Output of the command execution"
                  resize="vertical"
                  readonly>
                </vscode-textarea>
            </vscode-form-group>

            <div class="group-buttons">
                <vscode-button
                  ref="clear-logs-button"
                  form="init-form" secondary>
                  <span class="codicon codicon-clear-all"></span>
                &nbsp; Clear Logs
                </vscode-button>
                <vscode-button
                  ref="copy-logs-button"
                  form="init-form" secondary>
                  <span class="codicon codicon-copy"></span>
                &nbsp; Copy Logs
                </vscode-button>
                <vscode-button
                  ref="open-log-file-button"
                  form="init-form" secondary disabled>
                  <span class="codicon codicon-open-preview"></span>
                &nbsp; Open Log File
                </vscode-button>
                <vscode-button
                  ref="open-folder-button"
                  form="init-form" disabled>
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

#log-text-area{
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
    border-color: var(--focus-border);;
    border-width: 0.5px;
    padding: 8px;
}

.log-level-div {
    margin: 4px 0px;
}

</style>
