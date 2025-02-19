import { createApp } from "vue";
import App from "./App.vue";

import hljs from "highlight.js/lib/core";
import yaml from "highlight.js/lib/languages/yaml";
import hljsVuePlugin from "@highlightjs/vue-plugin";
import ProgressSpinner from "primevue/progressspinner";
import PrimeVue from "primevue/config";
import Material from "@primevue/themes/material";

hljs.registerLanguage("yaml", yaml);

const app = createApp(App);
app.use(hljsVuePlugin);

app.use(PrimeVue, {
  theme: {
    preset: Material,
  },
});

app.component("ProgressSpinner", ProgressSpinner);
app.mount("#app");
