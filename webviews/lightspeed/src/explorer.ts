import "@vscode-elements/elements/dist/vscode-button";

import { createApp } from "vue";
import App from "@webviews/lightspeed/src/ExplorerApp.vue";

import hljs from "highlight.js/lib/core";
import yaml from "highlight.js/lib/languages/yaml";
import hljsVuePlugin from "@highlightjs/vue-plugin";
import { vscodeApi } from "@webviews/lightspeed/src/utils";

hljs.registerLanguage("yaml", yaml);

const app = createApp(App);
app.use(hljsVuePlugin);

app.mount("#app");

// Set up message handlers for explorer commands
vscodeApi.on("connect", () => {
  vscodeApi.post("command", { command: "connect" });
});

vscodeApi.on("generate", () => {
  vscodeApi.post("command", { command: "generate" });
});

vscodeApi.on("explain", () => {
  vscodeApi.post("command", { command: "explain" });
});

vscodeApi.on("generateRole", () => {
  vscodeApi.post("command", { command: "generateRole" });
});

vscodeApi.on("explainRole", () => {
  vscodeApi.post("command", { command: "explainRole" });
});
