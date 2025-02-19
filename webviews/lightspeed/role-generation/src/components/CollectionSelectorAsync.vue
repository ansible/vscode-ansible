<script setup lang="ts">
import { ref, Ref } from 'vue';
import { allComponents, provideVSCodeDesignSystem } from '@vscode/webview-ui-toolkit';
import { AnsibleCollection } from "../../../../../src/features/lightspeed/utils/scanner";
import { vscodeApi } from '../utils';

provideVSCodeDesignSystem().register(allComponents);


const collectionName = defineModel<string>("collectionName", { type: String });
const errorMessages = defineModel<string[]>("errorMessages", { required: true });

const collectionList: Ref<AnsibleCollection[]> = ref([]);


async function getCollectionList() {
    return vscodeApi.postAndReceive('getCollectionList', {}).then((data: any) => {
        const collectionList = data as AnsibleCollection[];
        if (collectionList.length === 0) {
            errorMessages.value.push("Please create an Ansible collection in your workspace.")
        }
        return collectionList;
    });

}
collectionList.value = await getCollectionList();

</script>

<template>


    <div class="dropdown-container" id="collectionSelectorContainer">
        <label for="selectedCollectionName">Select the collection to create role in:</label>

        <vscode-dropdown id="selectedCollectionName" position="below" v-model="collectionName">

            <vscode-option v-for="collection in collectionList" :value="collection.fqcn">{{ collection.fqcn
                }}</vscode-option>

        </vscode-dropdown>

        <p>
            A collection can contain one or more roles in the roles/ directory and these are almost
            identical to standalone roles, except you need to move plugins out of the individual
            roles, and use the FQCN in some places, as detailed in the next section.
        </p>
    </div>
</template>


<style scoped></style>
