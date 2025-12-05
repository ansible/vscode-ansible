<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Ref } from 'vue'
import { vscodeApi } from './utils';
import { allComponents, provideVSCodeDesignSystem } from '@vscode/webview-ui-toolkit';

import { PlaybookGenerationResponseParams, RoleFileType, FeedbackRequestParams } from "../../../src/interfaces/lightspeed";
import { WizardGenerationActionType } from '../../../src/definitions/lightspeed';

import OutlineReview from './components/lightspeed/OutlineReview.vue';
import GeneratedFileEntry from "./components/lightspeed/GeneratedFileEntry.vue";
import ErrorBox from './components/ErrorBox.vue';
import PromptExampleBox from './components/lightspeed/PromptExampleBox.vue';
import PromptField from './components/lightspeed/PromptField.vue';
import StatusBoxPrompt from './components/lightspeed/StatusBoxPrompt.vue';

provideVSCodeDesignSystem().register(allComponents);

const page = ref(1);
const prompt = ref('');
const response: Ref<PlaybookGenerationResponseParams | undefined> = ref();
const outline = ref('');
const errorMessages: Ref<string[]> = ref([])
const loadingNewResponse = ref(false);
const filesWereSaved = ref(false);
let wizardId = crypto.randomUUID();

async function sendActionEvent(action: WizardGenerationActionType, fromPage: undefined | number = undefined, toPage: undefined | number = undefined) {
  const request: FeedbackRequestParams = {
    playbookGenerationAction: {
      wizardId,
      action,
      fromPage: fromPage,
      toPage: toPage,
    },
  }
  vscodeApi.post('feedback', { request });
}

async function nextPage() {
  if (response.value !== undefined) {
    page.value++;
    return;
  }
  loadingNewResponse.value = true;
  await vscodeApi.post('generatePlaybook', { text: prompt.value, outline: outline.value });

}

async function openEditor() {
  if (response && response.value && response.value.playbook) {
    await vscodeApi.post('openEditor', { content: response.value.playbook });
    sendActionEvent(WizardGenerationActionType.CLOSE_ACCEPT, page.value, undefined);
  }
}

vscodeApi.on('generatePlaybook', (data: any) => {
  response.value = undefined; // To disable the watchers
  outline.value = data["outline"] || outline.value;
  if (Array.isArray(data["warnings"])) {
    errorMessages.value.push(...data["warnings"]);
  }
  response.value = data as PlaybookGenerationResponseParams;
  loadingNewResponse.value = false;
  page.value++;
});

vscodeApi.on('errorMessage', (data: string) => {
  loadingNewResponse.value = false; // Stop loading spinner
  errorMessages.value = [data]; // Show error in ErrorBox
});

// Reset some stats before the page transition
watch(page, (toPage, fromPage) => {
  errorMessages.value = [];
  filesWereSaved.value = false;
  sendActionEvent(WizardGenerationActionType.TRANSITION, fromPage, toPage)
})

watch(prompt, (newPrompt) => {
  if (response.value !== undefined) {
    response.value = undefined;
    outline.value = "";
  }
  wizardId = crypto.randomUUID();
})

watch(outline, (newOutline) => {
  if (response.value !== undefined && response.value["outline"] !== newOutline) {
    response.value = undefined;
  }
})

sendActionEvent(WizardGenerationActionType.OPEN, undefined, 1);
</script>

<template>
  <h2 id="main-header">Create a playbook with Ansible Lightspeed</h2>
  <div class="pageNumber" id="page-number">{{ page }} of 3</div>

  <ErrorBox v-model:error-messages="errorMessages" />

  <ProgressSpinner v-if="loadingNewResponse" />

  <div v-else-if="page === 1">
    <PromptField v-model:prompt="prompt" placeholder="I want to write a playbook that will..." />

    <div>
      <vscode-button @click.once="nextPage" :disabled="prompt === ''">
        Analyze
      </vscode-button>
    </div>
    <PromptExampleBox />
  </div>

  <div v-else-if="page === 2">
    <StatusBoxPrompt :prompt="prompt" @restart-wizard="page = 1" />

    <OutlineReview :outline type="playbook"
      @outline-update="(newOutline: string) => { console.log(`new outline: ${newOutline}`); outline = newOutline; }" />

    <div>
      <vscode-button @click.once="nextPage">
        Continue
      </vscode-button>
      <vscode-button secondary @click="page--">
        Back
      </vscode-button>
    </div>
  </div>

  <div v-else-if="page === 3">
    <GeneratedFileEntry
      :file="{ 'content': response ? response.playbook : '', 'path': 'new_playbook.yaml', 'file_type': RoleFileType.Playbook }" />
    <div>
      <vscode-button @click="openEditor">
        Open editor
      </vscode-button>
      <vscode-button secondary @click="page--">
        Back
      </vscode-button>
    </div>
  </div>
</template>

<style scoped></style>
