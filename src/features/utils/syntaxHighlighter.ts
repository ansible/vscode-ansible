import { getSingletonHighlighterCore, HighlighterCore } from "@shikijs/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import darkPlus from "shiki/themes/dark-plus.mjs";
import lightPlus from "shiki/themes/light-plus.mjs";
import { default as yamlLang } from "shiki/langs/yaml.mjs";
import getWasm from "shiki/wasm";

let highlighter: HighlighterCore;

export async function codeToHtml(code: string, theme: string, lang: string) {
  if (!highlighter) {
    highlighter = await getSingletonHighlighterCore({
      themes: [darkPlus, lightPlus],
      langs: [yamlLang],
      loadWasm: getWasm,
      engine: createOnigurumaEngine(import("shiki/wasm")),
    });
  }

  const html = highlighter.codeToHtml(code, {
    theme,
    lang,
  });

  return html;
}
