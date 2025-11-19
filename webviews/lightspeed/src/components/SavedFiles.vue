<script setup lang="ts">
import { ref } from 'vue';
import { vscodeApi } from '../utils';
import { GenerationListEntry } from '../../../../src/interfaces/lightspeed';

import SavedFilesEntry from './SavedFilesEntry.vue';

interface IWriteRoleInWorkspaceOutputEntry {
    longPath: string,
    absolutePath?: string,
    command: string,
}

interface IWriteRoleInWorkspaceResponse {
    data: IWriteRoleInWorkspaceOutputEntry[],
    roleLocation?: string,
}


const props = defineProps<{
    files: GenerationListEntry[],
    roleName: string,
    collectionName: string
}>();


const roleLocation = ref<string>('');

async function writeRoleInWorkspace() {
    const payload = {
        files: props.files.map((i) => [i.path, i.content, i.file_type]),
        collectionName: props.collectionName,
        roleName: props.roleName
    }).then((data: any) => {
        return data as IWriteRoleInWorkspaceOutputEntry[];
    });
}

const savedFiles = await writeRoleInWorkspace();
</script>

<template>
    <div>
        <strong>Saved files:</strong>
        <ul id="roleFileResultFileList"></ul>
        <ul>
            <SavedFilesEntry v-for="file in savedFiles" :longPath="file.longPath" :command="file.command" />
        </ul>
        <div v-if="roleLocation" style="margin-top: 1em; padding: 0.5em; background-color: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border);">
            <strong>Role created at:</strong>
            <div style="margin-top: 0.5em; font-family: monospace; font-size: 0.9em;">
                {{ roleLocation }}
            </div>
        </div>
    </div>
</template>

<style scoped></style>
