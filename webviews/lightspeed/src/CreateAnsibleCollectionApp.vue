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
                <vscode-textfield id="collection-name" form="init-form" placeholder="Enter collection name" size="512"></vscode-textfield>
            </vscode-form-group>

            <div id="full-collection-name" class="full-collection-name">
                <p>Collection name:&nbsp</p>
            </div>

            <vscode-form-group variant="vertical">
                <vscode-label for="path-url">
                <span class="normal">Init path</span>
                </vscode-label>
                <vscode-textfield id="path-url" class="required" form="init-form" placeholder="${homeDir}/.ansible/collections/ansible_collections"
                size="512">
                <vscode-icon
                    slot="content-after"
                    id="folder-explorer"
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
                <vscode-single-select id="verbosity-dropdown" position="below">
                    <vscode-option>Off</vscode-option>
                    <vscode-option>Low</vscode-option>
                    <vscode-option>Medium</vscode-option>
                    <vscode-option>High</vscode-option>
                </vscode-single-select>
                </div>
            </div>

            <div class="checkbox-div">
                <vscode-checkbox id="log-to-file-checkbox" form="init-form">Log output to a file <br><i>Default path:
                    ${tempDir}/ansible-creator.log.</i></vscode-checkbox>
            </div>

            <div id="log-to-file-options-div">
                <vscode-form-group variant="vertical">
                <vscode-label for="log-file-path">
                    <span class="normal">Log file path</span>
                </vscode-label>
                <vscode-textfield id="log-file-path" class="required" form="init-form" placeholder="${tempDir}/ansible-creator.log"
                    size="512">
                    <vscode-icon
                    slot="content-after"
                    id="file-explorer"
                    name="file"
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
                <vscode-checkbox id="overwrite-checkbox" form="init-form">Overwrite <br><i>Overwriting will remove the existing content in the specified directory and replace it with the files from the Ansible collection.</i></vscode-checkbox>
            </div>

            <div class="checkbox-div">
                <vscode-checkbox id="editable-mode-checkbox" form="init-form">Install collection from source code (editable mode) <br><i>This will
                allow immediate reflection of content changes without having to reinstalling it. <br>
                (NOTE: Requires ansible-dev-environment installed in the environment.)</i></vscode-checkbox>
                <a id="ade-docs-link" href="https://ansible.readthedocs.io/projects/dev-environment/">Learn more</a>
            </div>

            <div class="group-buttons">
                <vscode-button id="clear-button" form="init-form" secondary>
                <span class="codicon codicon-clear-all"></span>
                &nbsp; Clear All
                </vscode-button>
                <vscode-button id="create-button" form="init-form">
                <span class="codicon codicon-run-all"></span>
                &nbsp; Create
                </vscode-button>
            </div>

            <vscode-divider></vscode-divider>
            <vscode-form-group variant="vertical">
                <vscode-label id="vscode-logs-label" for="log-text-area">
                <span class="normal">Logs</span>
                </vscode-label>
                <vscode-textarea id="log-text-area" placeholder="Output of the command execution"
                resize="vertical" readonly></vscode-textarea>
            </vscode-form-group>

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
