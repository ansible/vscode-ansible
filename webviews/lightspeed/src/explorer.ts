import "@vscode-elements/elements/dist/vscode-button";

import { createApp } from "vue";
import App from "./ExplorerApp.vue";

import hljs from "highlight.js/lib/core";
import yaml from "highlight.js/lib/languages/yaml";
import hljsVuePlugin from "@highlightjs/vue-plugin";
import ProgressSpinner from "primevue/progressspinner";
import PrimeVue from "primevue/config";
import { definePreset } from "@primeuix/themes";
import Nora from "@primeuix/themes/nora";
import { vscodeApi } from "./utils";

hljs.registerLanguage("yaml", yaml);

const app = createApp(App);
app.use(hljsVuePlugin);

const MyPreset = definePreset(Nora, {
  semantic: {
    colorScheme: {
      light: {
        primary: {
          color: "var(--vscode-focusBorder)",
        },
        highlight: {
          background: "var(--vscode-dropdown-listBackground))",
          focusBackground: "var(--vscode-inputOption-activeBackground)",
          color: "var(--vscode-dropdown-foreground)",
        },
        formField: {
          background: "var(--vscode-background)",
          borderColor: "var(--vscode-checkbox-selectBorder)",
          color: "var(--vscode-foreground)",
          focusColor: "var(--vscode-foreground)",
        },
      },
      dark: {
        primary: {
          color: "var(--vscode-focusBorder)",
        },
        highlight: {
          background: "var(--vscode-dropdown-listBackground))",
          focusBackground: "var(--vscode-inputOption-activeBackground)",
          color: "var(--vscode-dropdown-foreground)",
        },
        formField: {
          background: "var(--vscode-background)",
          borderColor: "var(--vscode-checkbox-selectBorder)",
          color: "var(--vscode-foreground)",
          focusColor: "var(--vscode-foreground)",
        },
      },
    },
  },
});

app.use(PrimeVue, {
  theme: {
    preset: MyPreset,
    options: {
      darkModeSelector: ".my-app-dark",
    },
  },
});

const mutationObserver = new MutationObserver((mutationsList, observer) => {
  const isDark = document
    .querySelector("body")
    ?.getAttribute("class")
    ?.includes("vscode-dark");

  document.documentElement.classList.toggle("my-app-dark", isDark);
});
mutationObserver.observe(document.body, { childList: false, attributes: true });

app.component("ProgressSpinner", ProgressSpinner);
app.mount("#app");

// Set up message handlers for explorer commands
vscodeApi.on('connect', () => {
  vscodeApi.post('command', { command: 'connect' });
});

vscodeApi.on('generate', () => {
  vscodeApi.post('command', { command: 'generate' });
});

vscodeApi.on('explain', () => {
  vscodeApi.post('command', { command: 'explain' });
});

vscodeApi.on('generateRole', () => {
  vscodeApi.post('command', { command: 'generateRole' });
});

vscodeApi.on('explainRole', () => {
  vscodeApi.post('command', { command: 'explainRole' });
});
