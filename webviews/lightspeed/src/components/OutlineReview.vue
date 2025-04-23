<script setup lang="ts">
import {
  calculateNewCursorPosition,
  digitsInNumber,
  countNewlinesBeforePosition,
  getStringBetweenNewlines,
  reapplyLineNumbers,
  removeLine,
  shouldRemoveLine
} from '../utils/outlineLineNumbers';

defineProps<{
  outline: string;
  type: "playbook" | "role";
}>();

const emit = defineEmits<{ outlineUpdate: [outline: string] }>();

function outlineWithLineNumber(): void {
  const textField = document.querySelector("#outline-field") as HTMLTextAreaElement;
  if (!textField) return;

  const originalPosition = textField.selectionStart || 0;
  const newLinesBeforePosition = countNewlinesBeforePosition(textField.value, originalPosition);
  const numDigits = digitsInNumber(newLinesBeforePosition + 1);
  const lineText = getStringBetweenNewlines(textField.value, originalPosition);
  const previousNewLineIndex = textField.value.lastIndexOf("\n", originalPosition - 1);

  if (shouldRemoveLine(lineText, numDigits)) {
    removeLine(textField, originalPosition, previousNewLineIndex);
  }

  reapplyLineNumbers(textField);

  const newCursorPosition = calculateNewCursorPosition(
    textField.value,
    originalPosition,
    previousNewLineIndex,
    numDigits
  );

  textField.setSelectionRange(newCursorPosition, newCursorPosition);
  emit("outlineUpdate", textField.value);
}

</script>

<template>
  <div>
    <h4>Review the suggested steps for your {{type}} and modify as needed.</h4>
    <textarea id="outline-field" :rows="outline.split('\n').length + 2" :cols="70" :value="outline.toString()"
      @input="outlineWithLineNumber" />
  </div>
</template>

<style scoped></style>
