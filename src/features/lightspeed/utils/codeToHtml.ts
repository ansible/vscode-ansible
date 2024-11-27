export async function codeToHtml(
  code: string,
  darkMode: boolean,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let syntaxHighlighter: any;
  try {
    syntaxHighlighter =
      await require(/* webpackIgnore: true */ "../../../syntaxHighlighter/src/syntaxHighlighter");
  } catch {
    syntaxHighlighter =
      await require(/* webpackIgnore: true */ "../../../../../syntaxHighlighter/src/syntaxHighlighter");
  }
  const html = await syntaxHighlighter.codeToHtml(
    code,
    darkMode ? "dark-plus" : "light-plus",
    "yaml",
  );
  return html;
}
