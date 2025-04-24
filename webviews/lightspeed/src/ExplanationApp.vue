<script setup lang="ts">
import { ref, toRaw, watch } from "vue";
import * as marked from "marked";
import { v4 as uuidv4 } from "uuid";
import { vscodeApi } from "./utils";
import { getObjectKeys } from "../../../src/features/lightspeed/utils/explanationUtils";
import { allComponents, provideVSCodeDesignSystem } from '@vscode/webview-ui-toolkit';
import { ExplanationRequestParams, ExplanationResponseParams, FeedbackRequestParams, GenerationListEntry, RoleExplanationRequestParams } from "../../../src/interfaces/lightspeed";
import FeedbackBox from "./components/FeedbackBox.vue";

provideVSCodeDesignSystem().register(allComponents);

const loadingExplanation = ref(true);
const noTasksInPlaybook = ref(false);
const explanationType = ref<"playbook" | "role" | null>(null);
const playbookData = ref<{ content: string | null; fileName: string | null }>({ content: null, fileName: null });
const roleData = ref<{ files: GenerationListEntry[] | []; roleName: string | null }>({ files: [], roleName: null });
const errorMessage = ref<string | null>(null);
const explanationHtml = ref<string | null>(null);
const explanationId = uuidv4();

function hasTasks(content: string): boolean {
  const taskKeywords = ["tasks", "pre_tasks", "post_tasks", "handlers"];
  return getObjectKeys(content).some((key) => taskKeywords.includes(key));
}

async function fetchPlaybookExplanation() {
  if (!playbookData.value || !playbookData.value.content) {
    loadingExplanation.value = false;
    return;
  }

  if (!hasTasks(playbookData.value.content)) {
    loadingExplanation.value = false;
    noTasksInPlaybook.value = true;
    return;
  }

  const feedbackRequest: FeedbackRequestParams = {
    playbookExplanation: {
      explanationId: explanationId
    }
  }

  vscodeApi.post("feedback", { request: feedbackRequest })

  const explanationRequest: ExplanationRequestParams = {
    content: playbookData.value.content,
    explanationId,
  };
  vscodeApi.post("explainPlaybook", explanationRequest);
}

async function fetchRoleExplanation() {
  if (!roleData.value || !roleData.value.files || !roleData.value.roleName) {
    loadingExplanation.value = false;
    return;
  }

  const feedbackRequest: FeedbackRequestParams = {
    roleExplanation: {
      explanationId: explanationId
    }
  }

  vscodeApi.post("feedback", { request: feedbackRequest });

  const explanationRequest: RoleExplanationRequestParams = {
    files: toRaw(roleData.value.files),
    roleName: roleData.value.roleName,
    explanationId,
  };
  vscodeApi.post("explainRole", explanationRequest);
}

vscodeApi.on("explainPlaybook", (data: ExplanationResponseParams) => {
  let markdown = data.content;
  if (markdown.length === 0) {
    markdown = "### No explanation provided.";
  }
  const html_snippet = marked.parse(markdown) as string;
  loadingExplanation.value = false;
  explanationHtml.value = html_snippet;
});

vscodeApi.on("explainRole", (data: ExplanationResponseParams) => {
  let markdown = data.content;
  if (markdown.length === 0) {
    markdown = "### No explanation provided.";
  }
  const html_snippet = marked.parse(markdown) as string;
  loadingExplanation.value = false;
  explanationHtml.value = html_snippet;
});

vscodeApi.on("setPlaybookData", (data: { content: string, fileName: string }) => {
  explanationType.value = "playbook";
  playbookData.value = {
    content: data.content,
    fileName: data.fileName
  };
});

vscodeApi.on("setRoleData", (data: { files: GenerationListEntry[], roleName: string }) => {
  explanationType.value = "role";
  roleData.value = {
    files: data.files,
    roleName: data.roleName
  };
});

vscodeApi.on("errorMessage", (message: string) => {
  loadingExplanation.value = false;
  errorMessage.value = message;
});

watch(() => roleData.value, (newValue) => {
  if (newValue && newValue.files && newValue.files.length > 0 && newValue.roleName) {
    loadingExplanation.value = true;
    noTasksInPlaybook.value = false;
    explanationHtml.value = null;
    fetchRoleExplanation();
  }
}, { immediate: true });

watch(() => playbookData.value, (newValue) => {
  if (newValue && newValue.content && newValue.fileName) {
    loadingExplanation.value = true;
    noTasksInPlaybook.value = false;
    explanationHtml.value = null;
    fetchPlaybookExplanation();
  }
}, { immediate: true });
</script>

<template>
  <div v-if="loadingExplanation" id="icons">
    <span class="codicon codicon-loading codicon-modifier-spin"></span>
    <span v-if="playbookData.fileName">&nbsp;Generating the explanation for {{playbookData.fileName.split("/").at(-1)}}</span>
    <span v-if="roleData.roleName">&nbsp;Generating the explanation for role: {{roleData.roleName}}</span>
  </div>
  <div class="explanation" v-else-if="errorMessage">
    <p>
      <span class="codicon codicon-error"></span>
      &nbsp;{{ errorMessage }}
    </p>
  </div>
  <div class="explanation" v-else-if="noTasksInPlaybook">
    <p>
      <span class="codicon codicon-info"></span>
      &nbsp;Explaining a playbook with no tasks in the playbook is not supported.
    </p>
  </div>
  <div v-else-if="explanationHtml">
    <div class="explanation" v-html="explanationHtml"></div>
    <FeedbackBox :explanationId="explanationId" />
  </div>
  <div class="explanation" v-else>
    <p>No explanation available.</p>
  </div>
</template>

<style scoped>
  .codicon {
    line-height: 36px;
  }
</style>
