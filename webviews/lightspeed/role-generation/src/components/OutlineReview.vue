<script setup lang="ts">
import { provideVSCodeDesignSystem, vsCodeTextArea } from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(vsCodeTextArea());

defineProps<{ outline: string }>();

const emit = defineEmits<{ outlineUpdate: [outline: string] }>();


function outlineWithLineNumber() {
  let textField = document.querySelector("#outline-field") as HTMLTextAreaElement;
  const originalPosition = textField?.selectionStart;

  textField.value = textField.value.split("\n").map((l) => l.replace(/\d+\.\s/, '')).map((l, idx) => { return `${idx + 1}. ${l}` }).join("\n");
  const newPosition = textField.value[originalPosition - 1] === '\n' ? originalPosition + 3 : originalPosition;
  textField.setSelectionRange(newPosition, newPosition)
  emit("outlineUpdate", textField.value);

}
</script>

<template>
  <div>
    <h4>Review the suggested steps for your role and modify as needed.</h4>
    <vscode-text-area id="outline-field" :rows="outline.split('\n').length + 2"
      :cols="outline.split('\n')[0].length + 5" :value="outline.toString()" @input="outlineWithLineNumber" />
  </div>
</template>

<style scoped></style>
