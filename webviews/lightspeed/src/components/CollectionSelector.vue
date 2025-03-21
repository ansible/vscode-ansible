<script setup lang="ts">
import AutoComplete from 'primevue/autocomplete';

import { ref, Ref } from 'vue';
import { AnsibleCollection } from "../../../../src/features/lightspeed/utils/scanner";

import { vscodeApi } from '../utils';

const collectionName = defineModel<string>("collectionName", { type: String });

const collectionListCache: Ref<AnsibleCollection[]> = ref([]);
const collectionListFiltered: Ref<string[]> = ref([]);

function search(event) {
    if (!event.query.trim().length) {
        collectionListFiltered.value = [...collectionListCache.value].map(c => c.fqcn);
    } else {
        collectionListFiltered.value = collectionListCache.value.filter((collection) => {
            return collection.fqcn.toLowerCase().startsWith(event.query.toLowerCase());
        }).map(c => c.fqcn);
    }
}

vscodeApi.on('getCollectionList', (collectionList: AnsibleCollection[]) => {
    collectionListCache.value = collectionList;
});


vscodeApi.post('getCollectionList', {});


</script>

<template>

    <div v-if="collectionListCache.length == 0">
        <strong>We need a collection to store your new role, however none were found in your Workspace. You can create a
            one
            with the <a href="command:ansible.content-creator.create-ansible-collection"
                title="Create a collection project">
                <span class="codicon codicon-new-file"></span> Create new Ansible collection
            </a> action.
        </strong>
    </div>

    <div class="dropdown-container" id="collectionSelectorContainer" v-if="collectionListCache.length > 0">
        <label for="selectedCollectionName"><strong>Select the collection to create role in:</strong></label>

        <br />
        <div id="fieldBox">
            <AutoComplete id="collectionNameTextField" v-model="collectionName" dropdown size="small"
                name="selectedCollectionName" :suggestions="collectionListFiltered" @complete="search"
                :emptySearchMessage='"No collection found in the Workspace"' />
        </div>



        <p>
            A collection can contain one or more roles in the roles/ directory and these are almost
            identical to standalone roles, except you need to move plugins out of the individual
            roles, and use the FQCN in some places, as detailed in the next section.
        </p>
    </div>
</template>


<style scoped>
.dropdown-container {
    padding-top: 10px;
}

#fieldBox {
    padding-top: 10px;
}
</style>
