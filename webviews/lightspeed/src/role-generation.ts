import "@vscode-elements/elements/dist/vscode-button";
import "@vscode-elements/elements/dist/vscode-textfield";

import { createApp } from "vue";
import App from "@webviews/lightspeed/src/RoleGenApp.vue";

import hljs from "highlight.js/lib/core";
import yaml from "highlight.js/lib/languages/yaml";
import hljsVuePlugin from "@highlightjs/vue-plugin";

hljs.registerLanguage("yaml", yaml);

const app = createApp(App);
app.use(hljsVuePlugin);

app.mount("#app");
