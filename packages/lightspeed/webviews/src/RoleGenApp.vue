<script setup lang="ts">
import "@vscode/codicons/dist/codicon.css";
import "./lightspeed.css";
import { ref, watch } from "vue";
import type { Ref } from "vue";
import { vscodeApi } from "./utils";

import {
  FeedbackRequestParams,
  RoleGenerationResponseParams,
} from "./types";
import { WizardGenerationActionType } from "./types";

import SavedFiles from "./components/SavedFiles.vue";
import StatusBoxPrompt from "./components/lightspeed/StatusBoxPrompt.vue";
import OutlineReview from "./components/lightspeed/OutlineReview.vue";
import GeneratedFileEntry from "./components/lightspeed/GeneratedFileEntry.vue";
import CollectionSelector from "./components/CollectionSelector.vue";
import ErrorBox from "./components/ErrorBox.vue";
import PromptExampleBox from "./components/lightspeed/PromptExampleBox.vue";
import PromptField from "./components/lightspeed/PromptField.vue";

const page = ref(1);
const prompt = ref("");
const collectionName = ref("");
const roleName = ref("");
const response: Ref<RoleGenerationResponseParams | undefined> = ref();
const outline = ref("");
const errorMessages: Ref<string[]> = ref([]);
const loadingNewResponse = ref(false);
const filesWereSaved = ref(false);
let wizardId = crypto.randomUUID();

async function sendActionEvent(
  action: WizardGenerationActionType,
  fromPage: undefined | number = undefined,
  toPage: undefined | number = undefined,
) {
  const request: FeedbackRequestParams = {
    roleGenerationAction: {
      wizardId,
      action,
      fromPage: fromPage,
      toPage: toPage,
    },
  };
  vscodeApi.post("feedback", { request });
}

async function nextPage() {
  if (response.value !== undefined) {
    page.value++;
    return;
  }
  loadingNewResponse.value = true;
  await vscodeApi.post("generateRole", {
    name: roleName.value,
    text: prompt.value,
    outline: outline.value,
  });
}

vscodeApi.on("generateRole", (data: any) => {
  response.value = undefined; // To disable the watchers
  outline.value = data["outline"] || outline.value;
  if (Array.isArray(data["warnings"])) {
    errorMessages.value.push(...data["warnings"]);
  }
  response.value = data as RoleGenerationResponseParams;
  roleName.value = data["name"];
  loadingNewResponse.value = false;
  page.value++;
});

vscodeApi.on("errorMessage", (data: string) => {
  loadingNewResponse.value = false; // Stop loading spinner
  errorMessages.value = [data]; // Show error in ErrorBox
});

// Reset some stats before the page transition
watch(page, (toPage, fromPage) => {
  errorMessages.value = [];
  filesWereSaved.value = false;
  sendActionEvent(WizardGenerationActionType.TRANSITION, fromPage, toPage);
});

watch(prompt, (newPrompt) => {
  if (response.value !== undefined) {
    response.value = undefined;
    outline.value = "";
    roleName.value = "";
  }
});

watch(roleName, (newRoleName) => {
  if (response.value !== undefined && response.value["name"] !== newRoleName) {
    response.value = undefined;
  }
});

watch(outline, (newOutline) => {
  if (
    response.value !== undefined &&
    response.value["outline"] !== newOutline
  ) {
    response.value = undefined;
  }
});

watch(collectionName, (newCollectionName) => {
  // Reset filesWereSaved when collection name changes
  // This allows user to save to a different collection
  if (filesWereSaved.value) {
    filesWereSaved.value = false;
  }
});

watch(filesWereSaved, () => {
  sendActionEvent(
    WizardGenerationActionType.CLOSE_ACCEPT,
    page.value,
    undefined,
  );
});

sendActionEvent(WizardGenerationActionType.OPEN, undefined, 1);
</script>

<template>
  <div class="header-row">
    <h2 id="main-header">Create a role with Ansible Lightspeed</h2>
    <a
      class="header-link"
      href="https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_reuse_roles.html"
      ><span class="codicon codicon-link-external"></span> Learn more about roles</a
    >
  </div>
  <div class="pageNumber" id="page-number">{{ page }} of 3</div>

  <ErrorBox v-model:error-messages="errorMessages" />

  <ProgressSpinner v-if="loadingNewResponse" />

  <div v-else-if="page === 1" class="section">
    <PromptField
      v-model:prompt="prompt"
      placeholder="I want to write a role that will..."
    />

    <div class="button-group">
      <vscode-button @click.once="nextPage" :disabled="prompt === ''">
        Analyze
      </vscode-button>
    </div>
    <PromptExampleBox />
  </div>

  <div v-else-if="page === 2" class="section">
    <StatusBoxPrompt :prompt="prompt" @restart-wizard="page = 1" />

    <div class="field-row">
      <label for="roleNameInput">Role name:</label>
      <vscode-textfield id="roleNameInput" v-model="roleName" />
    </div>

    <p class="review-instructions">Review the suggested steps for your role and modify as needed.</p>

    <OutlineReview
      :outline
      type="role"
      @outline-update="
        (newOutline: string) => {
          outline = newOutline;
        }
      "
    />

    <div class="button-group">
      <vscode-button @click.once="nextPage"> Continue </vscode-button>
      <vscode-button secondary @click="page--"> Back </vscode-button>
    </div>
  </div>

  <div v-else-if="page === 3" class="section">
    <GeneratedFileEntry v-for="file in response?.files" :file />
    <Suspense>
      <SavedFiles
        v-if="filesWereSaved && response"
        :files="response.files"
        :role-name="roleName"
        :collection-name="collectionName"
      />
      <template #fallback>
        <ProgressSpinner />
      </template>
    </Suspense>
    <div class="section">
      <CollectionSelector
        v-if="!filesWereSaved"
        v-model:collection-name="collectionName"
        v-model:error-messages="errorMessages"
      />
      <div class="button-group">
        <vscode-button
          @click="filesWereSaved = true"
          :disabled="collectionName === '' || filesWereSaved"
        >
          Save files
        </vscode-button>
        <vscode-button secondary @click="page--"> Back </vscode-button>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
