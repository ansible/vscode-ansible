<script setup lang="ts">
import { vscodeApi } from '../utils';
import { GenerationListEntry } from '../../../../src/interfaces/lightspeed';

import SavedFilesEntry from './SavedFilesEntry.vue';

interface IWriteRoleInWorkspaceOutputEntry {
    longPath: string,
    command: string,
}


const props = defineProps<{
    files: GenerationListEntry[],
    roleName: string,
    collectionName: string
}>();


async function writeRoleInWorkspace() {
    return vscodeApi.postAndReceive('writeRoleInWorkspace', {
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
    <strong>Saved files:</strong>
    <ul id="roleFileResultFileList"></ul>
    <ul>
        <SavedFilesEntry v-for="file in savedFiles" :longPath="file.longPath" :command="file.command" />
    </ul>
</template>

<style scoped></style>
