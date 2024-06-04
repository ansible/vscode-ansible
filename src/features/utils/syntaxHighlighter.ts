import { getHighlighterCore, HighlighterCore } from "@shikijs/core";
import darkPlus from "shiki/themes/dark-plus.mjs";
import lightPlus from "shiki/themes/light-plus.mjs";
import { default as yamlLang } from "shiki/langs/yaml.mjs";
import getWasm from "shiki/wasm";

let highlighter: HighlighterCore;

export async function codeToHtml(code: string, theme: string, lang: string) {
  if (!highlighter) {
    highlighter = await getHighlighterCore({
      themes: [darkPlus, lightPlus],
      langs: [yamlLang],
      loadWasm: getWasm,
    });
  }

  const html = highlighter.codeToHtml(code, {
    theme,
    lang,
  });

  return html;
}
