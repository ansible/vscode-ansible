<script setup lang="ts">
import { ref } from "vue";
import { vscodeApi } from "../../utils";
import { ThumbsUpDownAction } from "../../../../../src/definitions/lightspeed";

const props = defineProps({
  explanationId: {
    type: String,
    required: true,
  },
});

const selectedFeedback = ref<"thumbsUp" | "thumbsDown" | null>(null);

function handleThumbsUp() {
  vscodeApi.post("explanationThumbsUp", {
    action: ThumbsUpDownAction.UP,
    explanationId: props.explanationId,
  });
  selectedFeedback.value = "thumbsUp";
}

function handleThumbsDown() {
  vscodeApi.post("explanationThumbsDown", {
    action: ThumbsUpDownAction.DOWN,
    explanationId: props.explanationId,
  });
  selectedFeedback.value = "thumbsDown";
}

</script>

<template>
    <div class="stickyFeedbackContainer">
      <div class="feedbackContainer">
        <vscode-button class="iconButton" :class="{'iconButtonSelected': selectedFeedback==='thumbsUp'}" appearance="icon" id="thumbsup-button" @click="handleThumbsUp" :disabled="selectedFeedback">
            <span class="codicon codicon-thumbsup"></span>
        </vscode-button>
        <vscode-button class="iconButton" :class="{'iconButtonSelected': selectedFeedback==='thumbsDown'}" appearance="icon" id="thumbsdown-button" @click="handleThumbsDown" :disabled="selectedFeedback">
            <span class="codicon codicon-thumbsdown"></span>
        </vscode-button>
      </div>
    </div>
</template>

<style scoped>
  .stickyFeedbackContainer {
    position: sticky;
    bottom: 0px;
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
</style>
