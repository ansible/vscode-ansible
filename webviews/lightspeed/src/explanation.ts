import "@vscode-elements/elements/dist/vscode-button";

import { createApp } from "vue";
import App from "@webviews/lightspeed/src/ExplanationApp.vue";

const app = createApp(App);

app.mount("#app");
