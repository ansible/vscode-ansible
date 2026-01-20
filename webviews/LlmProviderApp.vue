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
const apiEndpoint = ref<string>('');
const isLoading = ref<boolean>(true);
const saveIndicatorVisible = ref<boolean>(false);

// Computed
const selectedProviderInfo = computed(() => {
  return providers.value.find(p => p.type === currentProvider.value);
});

const needsApiKey = computed(() => {
  return currentProvider.value !== 'wca';
});

const showApiEndpoint = computed(() => {
  // Show API endpoint for all providers
  // WCA: for on-prem deployments
  // Google: for localhost testing
  return true;
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
    apiEndpoint: apiEndpoint.value,
  });
  
  // Show save indicator
  saveIndicatorVisible.value = true;
  setTimeout(() => {
    saveIndicatorVisible.value = false;
  }, 2000);
};

// Handle provider change - let backend load stored settings for new provider
const onProviderChange = () => {
  // Clear endpoint and model (these are provider-specific defaults)
  // API key is NOT cleared - backend stores keys per-provider and will return the saved key
  modelName.value = '';
  apiEndpoint.value = '';
  
  // Save provider change - backend will return stored API key for this provider
  saveProviderSettings();
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
      apiEndpoint.value = message.apiEndpoint || '';
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
    <div class="settings-wrapper">
      <header class="settings-header">
        <h1>LLM Provider Settings</h1>
        <p>Configure which AI provider powers Ansible Lightspeed features like code completion and playbook generation.</p>
      </header>

      <div v-if="isLoading" class="loading">
        <span class="codicon codicon-loading codicon-modifier-spin"></span>
        Loading provider settings...
      </div>

      <div v-else class="provider-container">
        <!-- Provider Selection -->
        <div class="section">
          <label for="provider-select" class="section-label">LLM Provider</label>
          <select 
            id="provider-select" 
            v-model="currentProvider" 
            class="provider-select"
            @change="onProviderChange"
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
          <span class="provider-badge">
            <span class="codicon codicon-check"></span>
            Currently active
          </span>
        </div>

        <!-- API Endpoint -->
        <div v-if="showApiEndpoint" class="section">
          <label for="api-endpoint" class="section-label">API Endpoint</label>
          <input 
            id="api-endpoint" 
            v-model="apiEndpoint" 
            type="text" 
            class="text-input"
            :placeholder="selectedProviderInfo?.defaultEndpoint || 'Leave empty for default'"
            @blur="saveProviderSettings"
          />
          <p class="description">
            {{ selectedProviderInfo?.configSchema.find(c => c.key === 'apiEndpoint')?.description || 'API endpoint URL. Leave empty to use the default endpoint.' }}
          </p>
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
            {{ selectedProviderInfo?.configSchema.find(c => c.key === 'modelName')?.description || 'Optional: Specify a model name to use. Leave empty to use the provider default.' }}
          </p>
        </div>
      </div>

      <!-- Save indicator -->
      <div :class="['save-indicator', { visible: saveIndicatorVisible }]">
        <span class="codicon codicon-check"></span> Settings saved
      </div>
    </div>
  </div>
</template>
