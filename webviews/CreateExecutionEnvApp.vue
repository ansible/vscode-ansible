<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { vscodeApi } from './lightspeed/src/utils';
import {
  useCommonWebviewState,
  openFolderExplorer,
  clearLogs,
  initializeUI,
  setupMessageHandler,
  clearAllFields,
  createFormValidator,
  createActionWrapper
} from './../src/features/contentCreator/webviewUtils';
import FormPageLayout from './FormPageLayout.vue';
const commonState = useCommonWebviewState();
const logs = commonState.logs;
const isCreating = commonState.isCreating;

// Form fields
const destinationPath = ref('');
const baseImage = ref('');
const customBaseImage = ref('');
const collections = ref('');
const systemPackages = ref('');
const pythonPackages = ref('');
const tag = ref('');
const verbosity = ref('Off');
const isOverwritten = ref(false);
const createContext = ref(false);
const buildImage = ref(false);
const initEEProject = ref(false);

// Suggested collections
const suggestedCollections = ref({
  'amazon.aws': false,
  'ansible.network': false,
  'ansible.posix': false,
  'ansible.utils': false,
  'kubernetes.core': false
});

// State
const homeDir = ref('');
const projectUrl = ref('');
const openFileButtonDisabled = ref(true);
const createButtonDisabled = ref(true);

// Computed properties
const displayDestinationPath = computed(() => {
  const path = destinationPath.value.trim() || homeDir.value;
  return path ? `${path}/execution-environment.yml` : "No folders are open in the workspace - Enter a destination directory.";
});

const isCreateContextDisabled = computed(() => {
  return buildImage.value;
});

const isFormValid = createFormValidator({
  mainValidation: () => {
    const isDestinationPathProvided = destinationPath.value.trim() !== '' || homeDir.value !== '';
    const isTagProvided = tag.value.trim() !== '';
    const isBaseImageProvided = baseImage.value.trim() !== '' || customBaseImage.value.trim() !== '';
    const isInitEEProjectEnabled = initEEProject.value;

    // Original logic: enabled if initEEProject is checked OR (destination + tag + baseImage)
    return isInitEEProjectEnabled || (isDestinationPathProvided && isTagProvided && isBaseImageProvided);
  }
});

// Watchers
watch([baseImage], () => {
  if (baseImage.value.trim() !== '') {
    customBaseImage.value = '';
  }
  updateCreateButtonState();
});

watch([customBaseImage], () => {
  if (customBaseImage.value.trim() !== '') {
    baseImage.value = '';
  }
  updateCreateButtonState();
});

watch([buildImage], () => {
  if (buildImage.value) {
    createContext.value = true;
  }
  // Note: When buildImage is false, createContext remains as user set it
  // The disabled state is handled by the computed property isCreateContextDisabled
});

watch([destinationPath, tag, baseImage, customBaseImage, initEEProject, isCreating], () => {
  updateCreateButtonState();
});

function updateCreateButtonState() {
  createButtonDisabled.value = !isFormValid() || isCreating.value;
}

// Handlers
const handleOpenFolderExplorer = () => {
  openFolderExplorer(
    destinationPath.value || homeDir.value,
    homeDir.value,
    { selectOption: 'folder' }
  );
};

const handleCreate = createActionWrapper(
  isCreating,
  logs,
  createButtonDisabled,
  () => {
    openFileButtonDisabled.value = true;

    // Validate base image if context or build is enabled
    if (createContext.value || buildImage.value) {
      if (!baseImage.value.trim() && !customBaseImage.value.trim()) {
        alert("Please select or enter a base image.");
        isCreating.value = false;
        updateCreateButtonState();
        return;
      }
    }

    // Combine suggested and additional collections
    const selectedSuggested = Object.entries(suggestedCollections.value)
      .filter(([_, selected]) => selected)
      .map(([name, _]) => name);

    const additionalCollections = collections.value.trim()
      ? collections.value.split(',').map(c => c.trim()).filter(c => c.length > 0)
      : [];

    const finalCollections = [...selectedSuggested, ...additionalCollections]
      .filter(c => c.length > 0)
      .join(', ');

    const payload = {
      destinationPath: destinationPath.value.trim(),
      verbosity: verbosity.value.trim(),
      isOverwritten: isOverwritten.value,
      isCreateContextEnabled: createContext.value,
      isBuildImageEnabled: buildImage.value,
      isInitEEProjectEnabled: initEEProject.value,
      baseImage: baseImage.value.trim(),
      customBaseImage: customBaseImage.value.trim(),
      collections: finalCollections,
      systemPackages: systemPackages.value.trim(),
      pythonPackages: pythonPackages.value.trim(),
      tag: tag.value.trim(),
    };

    vscodeApi.postMessage({
      command: 'init-create-execution-env',
      payload,
    });
  }
);

const handleOpenFile = () => {
  if (!projectUrl.value) return;
  vscodeApi.postMessage({
    command: 'init-open-scaffolded-file',
    payload: {
      projectUrl: projectUrl.value,
    },
  });
};

const onClear = () => {
  const componentFields = {
    destinationPath, baseImage, customBaseImage, collections, systemPackages,
    pythonPackages, tag, verbosity, isOverwritten, createContext, buildImage,
    initEEProject, logs, projectUrl
  };
  const defaults = {
    verbosity: 'Off',
    isOverwritten: false,
    createContext: false,
    buildImage: false,
    initEEProject: false
  };
  clearAllFields(componentFields, defaults);

  // Reset suggested collections
  Object.keys(suggestedCollections.value).forEach(key => {
    suggestedCollections.value[key] = false;
  });

  openFileButtonDisabled.value = true;
  createButtonDisabled.value = true;
  isCreating.value = false;
};

function stripAnsiCodes(text: string): string {
  return text.replace(
    // This regex is used to strip ANSI escape codes for terminal text formatting
    // eslint-disable-next-line no-control-regex
    /[\u001B\u009B][[\]()#;?](?:(?:[a-zA-Z\d](?:;[a-zA-Z\d]))?\u0007|(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><])/g,
    "",
  );
}

onMounted(() => {
  setupMessageHandler({
    onHomeDirectory: (data) => {
      homeDir.value = data;
    },
    onHomedirAndTempdir: (homedir) => {
      if (homedir) {
        homeDir.value = homedir;
      }
    },
    onFolderSelected: (data) => {
      destinationPath.value = data;
    },
    onExecutionLog: (args) => {
      logs.value = stripAnsiCodes(args.commandOutput || '');
      projectUrl.value = args.projectUrl || '';

      if (args.status === 'passed') {
        openFileButtonDisabled.value = false;
      } else {
        openFileButtonDisabled.value = true;
      }

      isCreating.value = false;
      updateCreateButtonState();
    }
  });

  // Listen for additional message types specific to EE webview
  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.command) {
      case 'disable-build-button':
        createButtonDisabled.value = true;
        break;
      case 'enable-build-button':
        updateCreateButtonState();
        break;
      case 'enable-open-file-button':
        openFileButtonDisabled.value = false;
        break;
    }
  });

  initializeUI();
});
</script>

<template>
  <FormPageLayout
    title="Create an Ansible execution environment"
    subtitle="Define and build a container for automation execution"
  >
    <form id="init-form">
      <section class="component-container">

        <vscode-form-group variant="vertical">
          <vscode-label for="path-url">
            <span class="normal">Destination path</span>
          </vscode-label>
          <vscode-textfield
            id="path-url"
            v-model="destinationPath"
            class="required"
            form="init-form"
            :placeholder="homeDir"
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

        <div id="full-destination-path" class="full-destination-path">
          <p>Execution-environment file path:&nbsp;{{ displayDestinationPath }}</p>
        </div>

        <div class="verbose-div">
          <div class="dropdown-container">
            <vscode-label for="baseImage-dropdown">
              <span class="normal">Base image</span>
            </vscode-label>
            <vscode-single-select
              id="baseImage-dropdown"
              :value="baseImage"
              @change="baseImage = ($event.target as HTMLSelectElement).value"
              position="below"
            >
              <vscode-option value="">-- Select Base Image --</vscode-option>
              <vscode-option value="quay.io/fedora/fedora-minimal:41">quay.io/fedora/fedora-minimal:41</vscode-option>
              <vscode-option value="quay.io/centos/centos:stream10">quay.io/centos/centos:stream10</vscode-option>
              <vscode-option value="registry.redhat.io/ansible-automation-platform-25/ee-minimal-rhel8:latest">registry.redhat.io/ansible-automation-platform-25/ee-minimal-rhel8:latest (requires an active Red Hat registry login)</vscode-option>
            </vscode-single-select>
          </div>
        </div>

        <vscode-form-group variant="vertical">
          <vscode-label for="customBaseImage-name">
            <span class="normal">Custom base image</span>
          </vscode-label>
          <vscode-textfield
            id="customBaseImage-name"
            v-model="customBaseImage"
            form="init-form"
            placeholder="Provide a base image of your choice"
          ></vscode-textfield>
        </vscode-form-group>

        <div class="suggestedCollections-div">
          <div class="checkbox-container">
            <vscode-label for="suggestedCollections-checkboxes">
              <span class="normal">Suggested collections</span>
            </vscode-label>
            <div id="suggestedCollections-checkboxes">
              <vscode-checkbox
                v-model="suggestedCollections['amazon.aws']"
                :checked="suggestedCollections['amazon.aws']"
                @change="suggestedCollections['amazon.aws'] = ($event.target as HTMLInputElement).checked"
                value="amazon.aws"
              >amazon.aws</vscode-checkbox>
              <vscode-checkbox
                v-model="suggestedCollections['ansible.network']"
                :checked="suggestedCollections['ansible.network']"
                @change="suggestedCollections['ansible.network'] = ($event.target as HTMLInputElement).checked"
                value="ansible.network"
              >ansible.network</vscode-checkbox>
              <vscode-checkbox
                v-model="suggestedCollections['ansible.posix']"
                :checked="suggestedCollections['ansible.posix']"
                @change="suggestedCollections['ansible.posix'] = ($event.target as HTMLInputElement).checked"
                value="ansible.posix"
              >ansible.posix</vscode-checkbox>
              <vscode-checkbox
                v-model="suggestedCollections['ansible.utils']"
                :checked="suggestedCollections['ansible.utils']"
                @change="suggestedCollections['ansible.utils'] = ($event.target as HTMLInputElement).checked"
                value="ansible.utils"
              >ansible.utils</vscode-checkbox>
              <vscode-checkbox
                v-model="suggestedCollections['kubernetes.core']"
                :checked="suggestedCollections['kubernetes.core']"
                @change="suggestedCollections['kubernetes.core'] = ($event.target as HTMLInputElement).checked"
                value="kubernetes.core"
              >kubernetes.core</vscode-checkbox>
            </div>
          </div>
        </div>

        <vscode-form-group variant="vertical">
          <vscode-label for="collections-name">
            <span class="normal">Additional Collections</span>
          </vscode-label>
          <vscode-textfield
            id="collections-name"
            v-model="collections"
            form="init-form"
            placeholder="Provide a comma delimited list of collections to include in the image"
          ></vscode-textfield>
        </vscode-form-group>

        <vscode-form-group variant="vertical">
          <vscode-label for="systemPackages-name">
            <span class="normal">System packages</span>
          </vscode-label>
          <vscode-textfield
            id="systemPackages-name"
            v-model="systemPackages"
            form="init-form"
            placeholder="Provide a comma delimited list of system packages to install in the image"
          ></vscode-textfield>
        </vscode-form-group>

        <vscode-form-group variant="vertical">
          <vscode-label for="pythonPackages-name">
            <span class="normal">Additional python packages</span>
          </vscode-label>
          <vscode-textfield
            id="pythonPackages-name"
            v-model="pythonPackages"
            form="init-form"
            placeholder="Provide a comma delimited list. Collection dependencies are included by default."
          ></vscode-textfield>
        </vscode-form-group>

        <vscode-form-group variant="vertical">
          <vscode-label for="tag-name">
            <span class="normal">Tag</span>
            <sup>*</sup>
          </vscode-label>
          <vscode-textfield
            id="tag-name"
            v-model="tag"
            form="init-form"
            placeholder="Provide a name for the resulting image."
          ></vscode-textfield>
        </vscode-form-group>

        <div class="verbose-div">
          <div class="dropdown-container">
            <vscode-label for="verbosity-dropdown">
              <span class="normal">Output Verbosity</span>
            </vscode-label>
            <vscode-single-select
              id="verbosity-dropdown"
              :value="verbosity"
              @change="verbosity = ($event.target as HTMLSelectElement).value"
              position="below"
            >
              <vscode-option value="Off">Off</vscode-option>
              <vscode-option value="Low">Low</vscode-option>
              <vscode-option value="Medium">Medium</vscode-option>
              <vscode-option value="High">High</vscode-option>
            </vscode-single-select>
          </div>
        </div>

        <div class="checkbox-div">
          <vscode-checkbox
            id="createContext-checkbox"
            :checked="createContext"
            :disabled="isCreateContextDisabled"
            @change="createContext = ($event.target as HTMLInputElement).checked"
            form="init-form"
          >
            Create context <br><i>Create context for the execution-environment.</i>
          </vscode-checkbox>
        </div>

        <div class="checkbox-div">
          <vscode-checkbox
            id="buildImage-checkbox"
            :checked="buildImage"
            @change="buildImage = ($event.target as HTMLInputElement).checked"
            form="init-form"
          >
            Build image <br><i>Build the image of the execution-environment.</i>
          </vscode-checkbox>
        </div>

        <div class="checkbox-div">
          <vscode-checkbox
            id="initEE-checkbox"
            :checked="initEEProject"
            @change="initEEProject = ($event.target as HTMLInputElement).checked"
            form="init-form"
          >
            Include full project files <br><i>Initialize entire structure of execution-environment project.</i>
          </vscode-checkbox>
        </div>

        <div class="overwriteCheckbox-div">
          <vscode-checkbox
            id="overwrite-checkbox"
            :checked="isOverwritten"
            @change="isOverwritten = ($event.target as HTMLInputElement).checked"
            form="init-form"
          >
            Overwrite <br><i>Overwrite an existing execution-environment.yml file.</i>
          </vscode-checkbox>
        </div>

        <div class="group-buttons">
          <vscode-button
            id="clear-button"
            @click.prevent="onClear"
            form="init-form"
            appearance="secondary"
          >
            <span class="codicon codicon-clear-all"></span>
            &nbsp; Clear All
          </vscode-button>
          <vscode-button
            id="create-button"
            @click.prevent="handleCreate"
            :disabled="createButtonDisabled"
            form="init-form"
          >
            <span class="codicon codicon-run-all"></span>
            &nbsp; {{ isCreating ? 'Building...' : 'Build' }}
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
            cols="90"
            rows="10"
            placeholder="Output of the command execution"
            resize="vertical"
            readonly
          ></vscode-textarea>
        </vscode-form-group>

        <div class="group-buttons">
          <vscode-button
            id="clear-logs-button"
            @click.prevent="clearLogs(commonState.logs)"
            form="init-form"
            appearance="secondary"
          >
            <span class="codicon codicon-clear-all"></span>
            &nbsp; Clear Logs
          </vscode-button>
          <vscode-button
            id="open-file-button"
            @click.prevent="handleOpenFile"
            :disabled="openFileButtonDisabled"
            form="init-form"
            appearance="secondary"
          >
            <span class="codicon codicon-go-to-file"></span>
            &nbsp; Open Execution Environment file
          </vscode-button>
        </div>

      </section>
    </form>
  </FormPageLayout>
</template>

<style>
/* Component-specific styles for CreateExecutionEnvApp */
#log-text-area {
  width: 100%;
  height: 200px;
}

.overwriteCheckbox-div {
  display: flex;
  flex-direction: column;
  margin-top: 22px;
  margin-bottom: 20px;
  width: 100%;
}

.suggestedCollections-div {
  display: flex;
  flex-direction: column;
  margin-top: 18px;
  margin-bottom: 20px;
  width: 100%;
}

.checkbox-container {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  justify-content: flex-start;
}

#suggestedCollections-checkboxes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  width: 100%;
}

.verbose-div {
  margin-bottom: 15px;
}

vscode-single-select {
  width: 800px;
}

.full-destination-path {
  display: flex;
  flex-direction: row;
  color: var(--vscode-descriptionForeground);
}

.p-collection-name {
  font-style: italic;
}

vscode-checkbox i {
  width: 100%;
}

#ade-docs-link {
  margin-left: 30px;
  font-style: italic;
}
</style>
