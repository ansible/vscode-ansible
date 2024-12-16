export function shouldRequestForPromptPosition(
  documentContent: string,
  promptLine: number,
): boolean {
  const documentLines = documentContent.split("\n").map((l) => l.trim());
  if (documentLines.length > 0 && promptLine > 0) {
    const promptLineText = documentLines[promptLine - 1];
    if (promptLineText.startsWith("# ") && promptLineText.endsWith(" &")) {
      // should do not make request for prompt that ends with "&"
      return false;
    }
  }
  return true;
}

export function getContentWithMultiLinePromptForMultiTasksSuggestions(
  promptContent: string,
) {
  const promptLines = promptContent.trim().split("\n");
  const promptLine = promptLines.length;
  if (
    promptLine < 1 ||
    !promptLines[promptLine - 1].trim().startsWith("#") ||
    promptLines[promptLine - 1].trim().endsWith("&")
  ) {
    return promptContent;
  }

  const spacesBeforePromptStart =
    promptLines[promptLine - 1].match(/^ +/)?.[0].length || 0;

  const commentLines = [];
  for (let lineIndex = promptLine - 1; lineIndex >= 0; lineIndex--) {
    const spacesBeforeLinePromptStart =
      promptLines[lineIndex].match(/^ +/)?.[0].length || 0;
    let promptLineText = promptLines[lineIndex].trim();
    if (
      !promptLineText.startsWith("# ") ||
      (!promptLineText.endsWith(" &") && commentLines.length !== 0) ||
      spacesBeforeLinePromptStart !== spacesBeforePromptStart
    ) {
      break;
    }

    promptLineText = promptLineText.replace(/^# /g, "");
    promptLineText = promptLineText.replace(/&$/g, "");
    commentLines.push(promptLineText.trim());
  }

  if (commentLines.length > 1) {
    // create a new prompt based on the non-empty collected comments and
    // clear all other participating comments
    // Notes: do not delete the comments lines to preserve document lines count

    commentLines.reverse();
    const newPromptLineText = " "
      .repeat(spacesBeforePromptStart)
      .concat("# ", commentLines.filter(Boolean).join(" & "));

    for (
      let commentIndex = 0;
      commentIndex < commentLines.length;
      commentIndex++
    ) {
      if (commentIndex === 0) {
        promptLines[promptLine - 1] = newPromptLineText;
      } else {
        promptLines[promptLine - commentIndex - 1] = " "
          .repeat(spacesBeforePromptStart)
          .concat("# -");
      }
    }
    return promptLines.join("\n");
  }

  return promptContent;
}
