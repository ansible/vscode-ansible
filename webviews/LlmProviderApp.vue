<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { vscodeApi } from './lightspeed/src/utils';
import '../media/llmProviderView/style.css';

// Types
interface ProviderInfo {
  type: string;
  name: string;
  displayName: string;
  description: string;
  defaultEndpoint: string;
  configSchema: {
    key: string;
    label: string;
    type: string;
    required: boolean;
    placeholder: string;
    description: string;
  }[];
}

// State
const providers = ref<ProviderInfo[]>([]);
const currentProvider = ref<string>('wca');
const apiKey = ref<string>('');
const modelName = ref<string>('');
const isLoading = ref<boolean>(true);

// Computed
const selectedProviderInfo = computed(() => {
  return providers.value.find(p => p.type === currentProvider.value);
});

const needsApiKey = computed(() => {
  return currentProvider.value !== 'wca';
});

// Methods
const loadProviderSettings = () => {
  vscodeApi.postMessage({
    command: 'getProviderSettings',
  });
};

const saveProviderSettings = () => {
  vscodeApi.postMessage({
    command: 'saveProviderSettings',
    provider: currentProvider.value,
    apiKey: apiKey.value,
    modelName: modelName.value,
  });
};

// Message handler
const handleMessage = (event: MessageEvent) => {
  const message = event.data;
  
  switch (message.command) {
    case 'providerSettings':
      providers.value = message.providers || [];
      currentProvider.value = message.currentProvider || 'wca';
      apiKey.value = message.apiKey || '';
      modelName.value = message.modelName || '';
      isLoading.value = false;
      break;
  }
};

onMounted(() => {
  loadProviderSettings();
  window.addEventListener('message', handleMessage);
});
</script>

<template>
  <div id="llmProviderView">
    <div v-if="isLoading" class="loading">
      <span class="codicon codicon-loading codicon-modifier-spin"></span>
      Loading provider settings...
    </div>

    <div v-else class="provider-container">
      <!-- Provider Selection -->
      <div class="section">
        <label for="provider-select" class="section-label">LLM PROVIDER</label>
        <select 
          id="provider-select" 
          v-model="currentProvider" 
          class="provider-select"
          @change="saveProviderSettings"
        >
          <option 
            v-for="provider in providers" 
            :key="provider.type" 
            :value="provider.type"
          >
            {{ provider.displayName }}
          </option>
        </select>
        <p class="description">{{ selectedProviderInfo?.description }}</p>
      </div>

      <!-- API Key (for non-WCA providers) -->
      <div v-if="needsApiKey" class="section">
        <label for="api-key" class="section-label">API Key</label>
        <input 
          id="api-key" 
          v-model="apiKey" 
          type="password" 
          class="text-input"
          :placeholder="selectedProviderInfo?.configSchema.find(c => c.key === 'apiKey')?.placeholder || 'Enter your API key'"
          @blur="saveProviderSettings"
        />
        <p class="description">
          {{ selectedProviderInfo?.configSchema.find(c => c.key === 'apiKey')?.description }}
        </p>
      </div>

      <!-- Model Name (for non-WCA providers) -->
      <div v-if="needsApiKey" class="section">
        <label for="model-name" class="section-label">Model Name</label>
        <input 
          id="model-name" 
          v-model="modelName" 
          type="text" 
          class="text-input"
          :placeholder="selectedProviderInfo?.configSchema.find(c => c.key === 'modelName')?.placeholder || 'Leave empty for default'"
          @blur="saveProviderSettings"
        />
        <p class="description">
          {{ selectedProviderInfo?.configSchema.find(c => c.key === 'modelName')?.description || 'Optional model name override' }}
        </p>
      </div>
    </div>
  </div>
</template>