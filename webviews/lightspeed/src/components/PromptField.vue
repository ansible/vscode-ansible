<script setup lang="ts">
import AutoComplete from 'primevue/autocomplete';

import { vscodeApi } from '../utils';
import { ref } from 'vue';

import type { Ref } from 'vue'


const prompt = defineModel<string>("prompt", { required: true });
const placeholder = defineModel<string>("placeholder", { default: "" });

const recentPrompts: Ref<string[]> = ref([]);
const recentPromptsFiltered: Ref<string[]> = ref([]);

vscodeApi.on('getRecentPrompts', (prompts: string[]) => {
    recentPrompts.value = prompts.sort()
});


function search(event) {
    if (!event.query.trim().length) {
        recentPromptsFiltered.value = [...recentPrompts.value];
    } else {
        recentPromptsFiltered.value = recentPrompts.value.filter((prompt) => {
            return prompt.toLowerCase().startsWith(event.query.toLowerCase());
        });
    }
}

vscodeApi.post('getRecentPrompts', {});

</script>

<template>
    <div class="promptContainer">
        <label><strong>Describe what you want to achieve in natural language</strong></label>
        <div class="fieldBox">
            <AutoComplete id="PromptTextField" fluid v-model="prompt" size="small" :suggestions="recentPromptsFiltered"
                :placeholder @complete="search" :showEmptyMessage="false" />
        </div>
    </div>
</template>

<style scoped>
.promptContainer {
    padding-top: 20px;
    padding-bottom: 30px;

}

.fieldBox {
    padding-top: 10px;
}
</style>
