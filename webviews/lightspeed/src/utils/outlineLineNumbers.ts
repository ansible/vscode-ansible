export function textIsOnlyLineNumber(input: string): boolean {
  return /^\d*[.]?[ ]?$/.test(input);
}

export function digitsInNumber(number: number): number {
  return Math.abs(number).toString().length;
}

export function countNewlinesBeforePosition(
  text: string,
  position: number,
): number {
  return (text.slice(0, position).match(/\n/g) || []).length;
}

export function getStringBetweenNewlines(
  text: string,
  position: number,
): string {
  const start = text.lastIndexOf("\n", position - 1) + 1;
  const end = text.indexOf("\n", position);
  return text.slice(start, end === -1 ? text.length : end);
}

export function shouldRemoveLine(lineText: string, numDigits: number): boolean {
  return (
    textIsOnlyLineNumber(lineText) &&
    lineText.length > 0 &&
    lineText.length < numDigits + 2
  );
}

export function removeLine(
  textField: HTMLTextAreaElement,
  originalPosition: number,
  previousNewLineIndex: number,
): void {
  const nextNewLineIndex = textField.value.indexOf("\n", originalPosition);
  const beforeLine = textField.value.substring(0, previousNewLineIndex);
  const afterLine =
    nextNewLineIndex > 0 ? textField.value.substring(nextNewLineIndex) : "";

  textField.value = beforeLine + afterLine;
}

export function reapplyLineNumbers(textField: HTMLTextAreaElement): void {
  textField.value = textField.value
    .split("\n")
    .map((line, idx) => `${idx + 1}. ${line.replace(/^\d+[.]?[\s]?/, "")}`)
    .join("\n");
}

export function calculateNewCursorPosition(
  text: string,
  originalPosition: number,
  previousNewLineIndex: number,
  numDigits: number,
): number {
  if (text[originalPosition - 1] === "\n") {
    return originalPosition + numDigits + 2;
  } else if (originalPosition - previousNewLineIndex < numDigits + 3) {
    return previousNewLineIndex + numDigits + 3;
  }
  return originalPosition;
}
