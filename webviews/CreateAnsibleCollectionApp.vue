<script setup lang="ts">
import { onMounted, ref, computed, nextTick } from 'vue';
import { vscodeApi } from './lightspeed/src/utils';
import {
  useCommonWebviewState,
  openFolderExplorer,
  openFileExplorer,
  checkADEPresence,
  clearLogs,
  copyLogs,
  openLogFile,
  openScaffoldedFolder,
  initializeUI,
  setupMessageHandler,
  clearAllFields,
  createActionWrapper
} from './../src/features/contentCreator/webviewUtils';
import '../media/contentCreator/createAnsibleCollectionPageStyle.css';

const commonState = useCommonWebviewState();
const logs = commonState.logs;
const isCreating = commonState.isCreating;
const logFileUrl = commonState.logFileUrl;
const logFilePath = commonState.logFilePath;
const defaultLogFilePath = commonState.defaultLogFilePath;

const namespace = ref("");
const collectionName = ref("");
const initPath = ref("");
const verbosity = ref("off");
const logToFile = ref(false);
const logFileAppend = ref(false);
const isOverwritten = ref(false);
const isEditableModeInstall = ref(false);
const adePresent = ref(false);
const logLevel = ref("debug");
const collectionUrl = ref("");
const defaultInitPath = ref("");
const fullCollectionName = ref("");
const openScaffoldedFolderButtonDisabled = ref(true);

const isFormValid = computed(() => {
  return (
    namespace.value.trim() !== "" &&
    collectionName.value.trim() !== "" &&
    (initPath.value.trim() !== "" || defaultInitPath.value.trim() !== "")
  );
});

const handleOpenFolderExplorer = () => {
  const actualHomeDir = defaultInitPath.value ?
    defaultInitPath.value.replace('/.ansible/collections/ansible_collections', '') :
    commonState.homeDir.value;
  openFolderExplorer(actualHomeDir);
};

const handleOpenFileExplorer = () => {
  openFileExplorer(
    commonState.logFilePath.value,
    commonState.defaultLogFilePath.value,
    commonState.homeDir.value
  );
};

const handleClearLogs = () => clearLogs(commonState.logs);
const handleCopyLogs = () => copyLogs(commonState.logs.value);
const handleOpenLogFile = () => openLogFile(commonState.logFileUrl.value);
const handleOpenScaffoldedFolder = () => {
  openScaffoldedFolder(collectionUrl.value, 'collection');
};
const handleCheckADEPresence = () => checkADEPresence();
const handleCreate = createActionWrapper(
  isCreating,
  commonState.logs,
  commonState.createButtonDisabled,
  () => {
    const actualInitPath = initPath.value || defaultInitPath.value;
    const actualLogFilePath = commonState.logFilePath.value || commonState.defaultLogFilePath.value;

    const payload = {
      initPath: actualInitPath,
      namespaceName: namespace.value,
      collectionName: collectionName.value,
      verbosity: verbosity.value,
      logToFile: logToFile.value,
      logFileAppend: logFileAppend.value,
      isEditableModeInstall: isEditableModeInstall.value,
      logFilePath: actualLogFilePath,
      logLevel: logLevel.value,
      isOverwritten: isOverwritten.value,
    };

    vscodeApi.postMessage({ type: "init-create", payload });
  }
);

const onClear = () => {
  const componentFields = {
    namespace, collectionName, initPath, verbosity, logToFile,
    logFileAppend, isOverwritten, isEditableModeInstall, logLevel,
    collectionUrl, fullCollectionName
  };
  const defaults = {
    verbosity: "off",
    logLevel: "debug",
    logToFile: false,
    logFileAppend: false,
    isOverwritten: false,
    isEditableModeInstall: false
  };
  clearAllFields(componentFields, defaults);
  clearAllFields({
    logs: commonState.logs,
    logFileUrl: commonState.logFileUrl,
    logFilePath: commonState.logFilePath
  });
  commonState.openLogFileButtonDisabled.value = true;
  openScaffoldedFolderButtonDisabled.value = true;
  commonState.createButtonDisabled.value = false;
};

onMounted(async () => {
  try {
    initializeUI();
    await nextTick();
    setupMessageHandler({
      onHomedirAndTempdir: (homedir, tempdir) => {
        defaultInitPath.value = `${homedir}/.ansible/collections/ansible_collections`;
      },
      onExecutionLog: (args) => {
        if (isCreating.value) {
          collectionUrl.value = args.collectionUrl || "";

          if (args.status === "passed") {
            openScaffoldedFolderButtonDisabled.value = false;
          } else if (args.status === "in-progress") {
            openScaffoldedFolderButtonDisabled.value = true;
          } else {
            openScaffoldedFolderButtonDisabled.value = true;
            collectionUrl.value = "";
          }
        }
      },
      onADEPresence: (present) => {
        adePresent.value = present;
      },
      onFolderSelected: (selectedPath) => {
        initPath.value = selectedPath;
      }
    }, commonState);
    setTimeout(() => {
      try {
        handleCheckADEPresence();
      } catch (error) {
        console.warn('ADE presence check failed, continuing without it:', error);
      }
    }, 0);

  } catch (error) {
    console.error('Error during component mounting:', error);
  }
});
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
              {{ namespace || "namespace" }}{{ collectionName ? '.' + collectionName : (namespace ? '.' : '.collection') }}
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
              @click="handleOpenFolderExplorer"
            ></vscode-icon>
          </vscode-textfield>
        </vscode-form-group>

        <div id="full-collection-path" class="full-collection-name">
          <p>
            Project path:&nbsp;{{
                initPath.trim()
                  ? initPath
                  : (namespace && collectionName)
                    ? defaultInitPath + '/' + namespace + '/' + collectionName
                    : defaultInitPath
            }}
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
            id="log-to-file-checkbox"
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
                @click="handleOpenFileExplorer"
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
            id='overwrite-checkbox'
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
            id="editable-mode-checkbox"
            :checked="isEditableModeInstall"
            @change="isEditableModeInstall = $event.target.checked"
            :disabled="!adePresent"
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
            id="clear-button"
          >
            <span class="codicon codicon-clear-all"></span>&nbsp; Clear All
          </vscode-button>
          <vscode-button
            ref="initCreateButton"
            @click.prevent="handleCreate"
            :disabled="!isFormValid || isCreating"
            form="init-form"
            id="create-button"
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
            placeholder="Output of the command execution"
            resize="vertical"
            readonly
          >
          </vscode-textarea>
        </vscode-form-group>

        <div class="group-buttons">
          <vscode-button @click.prevent="handleClearLogs" form="init-form" secondary>
            <span class="codicon codicon-clear-all"></span>
            &nbsp; Clear Logs
          </vscode-button>
          <vscode-button @click.prevent="handleCopyLogs" form="init-form" secondary>
            <span class="codicon codicon-copy"></span>
            &nbsp; Copy Logs
          </vscode-button>
          <vscode-button
            ref="initOpenLogFileButton"
            @click.prevent="handleOpenLogFile"
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
            @click.prevent="handleOpenScaffoldedFolder"
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
