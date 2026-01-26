import "@vscode-elements/elements/dist/vscode-button";
import "@vscode-elements/elements/dist/vscode-checkbox";
import "@vscode-elements/elements/dist/vscode-divider";
import "@vscode-elements/elements/dist/vscode-form-group";
import "@vscode-elements/elements/dist/vscode-icon";
import "@vscode-elements/elements/dist/vscode-label";
import "@vscode-elements/elements/dist/vscode-option";
import "@vscode-elements/elements/dist/vscode-single-select";
import "@vscode-elements/elements/dist/vscode-textarea";
import "@vscode-elements/elements/dist/vscode-textfield";

import { createApp } from "vue";
import App from "./CreateAnsibleProjectApp.vue";

const app = createApp(App);

app.mount("#app");
