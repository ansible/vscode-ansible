<script setup lang="ts">
import ErrorBoxEntry from './ErrorBoxEntry.vue';
import { vscodeApi } from '../utils';

const errorMessages = defineModel<string[]>("errorMessages", { required: true });

vscodeApi.on('errorMessage', (data: any) => {
    console.log(`errorMessage: ${data}`);
    errorMessages.value.push(data);
});
</script>

<template>
    <ul id="errorContainer" v-if="errorMessages.length > 0">
        <ErrorBoxEntry v-for="message in errorMessages" :message />
    </ul>
</template>

<style scoped>
.codicon.codicon-warning {
    margin: 10px;
    color: red;
}

#errorContainer {
    padding-top: 10px;
    background: #e9d4d7;
    border-top: 2px solid red;
}

ul {
    list-style-type: none;
}
</style>
