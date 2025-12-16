<script setup lang="ts">
import { ref, computed } from "vue";
import { vscodeApi } from "../../utils";
import { ThumbsUpDownAction } from "../../../../../src/definitions/lightspeed";

const props = defineProps({
  explanationId: {
    type: String,
    required: true,
  },
  explanationType: {
    type: String as () => "playbook" | "role",
    default: "playbook",
  },
  telemetryEnabled: {
    type: Boolean,
    default: false,
  },
});

const selectedFeedback = ref<"thumbsUp" | "thumbsDown" | null>(null);

const isDisabled = computed(() => selectedFeedback.value !== null || !props.telemetryEnabled);

function handleThumbsUp() {
  if (!props.telemetryEnabled) return;
  vscodeApi.post("explanationThumbsUp", {
    action: ThumbsUpDownAction.UP,
    explanationId: props.explanationId,
    explanationType: props.explanationType,
  });
  selectedFeedback.value = "thumbsUp";
}

function handleThumbsDown() {
  if (!props.telemetryEnabled) return;
  vscodeApi.post("explanationThumbsDown", {
    action: ThumbsUpDownAction.DOWN,
    explanationId: props.explanationId,
    explanationType: props.explanationType,
  });
  selectedFeedback.value = "thumbsDown";
}

</script>

<template>
    <div class="stickyFeedbackContainer">
      <div class="feedbackContainer" :class="{'disabled': !telemetryEnabled}">
        <vscode-button class="iconButton" :class="{'iconButtonSelected': selectedFeedback==='thumbsUp'}" appearance="icon" id="thumbsup-button" @click="handleThumbsUp" :disabled="isDisabled">
            <span class="codicon codicon-thumbsup"></span>
        </vscode-button>
        <vscode-button class="iconButton" :class="{'iconButtonSelected': selectedFeedback==='thumbsDown'}" appearance="icon" id="thumbsdown-button" @click="handleThumbsDown" :disabled="isDisabled">
            <span class="codicon codicon-thumbsdown"></span>
        </vscode-button>
        <span v-if="!telemetryEnabled" class="tooltip">Feedback requires telemetry. Enable in Settings: redhat.telemetry.enabled</span>
      </div>
    </div>
</template>

<style scoped>
  .stickyFeedbackContainer {
    position: sticky;
    bottom: 0px;
  }
  .feedbackContainer {
    display: flex;
    flex-direction: row;
    position: relative;
  }
  .codicon {
    line-height: 36px;
  }
  .iconButton {
    width: 36px;
    height: 36px;
    margin: 0.2em;
    background: transparent;
    border: none;
    color: var(--vscode-button-secondaryForeground, #cccccc);
    opacity: 1.0;
    padding: 0;
  }
  .iconButtonSelected, .iconButton:not(:disabled):hover {
    background: var(--vscode-button-secondaryHoverBackground, #3c3c3c);
  }
  .disabled :deep(vscode-button) {
    pointer-events: none;
    opacity: 0.4;
  }
  .tooltip {
    visibility: hidden;
    opacity: 0;
    position: absolute;
    bottom: 100%;
    left: 0;
    background: var(--vscode-editorWidget-background, #252526);
    color: var(--vscode-editorWidget-foreground, #cccccc);
    border: 1px solid var(--vscode-editorWidget-border, #454545);
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    width: 220px;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    margin-bottom: 8px;
  }
  .disabled:hover .tooltip {
    visibility: visible;
    opacity: 1;
  }
</style>
