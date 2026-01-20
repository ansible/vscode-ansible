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

interface ProviderConfig {
  apiKey: string;
  modelName: string;
  apiEndpoint: string;
}

// State
const providers = ref<ProviderInfo[]>([]);
const activeProvider = ref<string>('wca');
const editingProvider = ref<string | null>(null);
const isLoading = ref<boolean>(true);
const saveIndicatorVisible = ref<boolean>(false);

// Provider-specific configs (stored locally for editing)
const providerConfigs = ref<Record<string, ProviderConfig>>({});

// Computed
const getProviderInfo = (type: string) => {
  return providers.value.find(p => p.type === type);
};

const needsApiKey = (providerType: string) => {
  return providerType !== 'wca';
};

// Methods
const loadProviderSettings = () => {
  vscodeApi.postMessage({
    command: 'getProviderSettings',
  });
};

const setActiveProvider = (providerType: string) => {
  activeProvider.value = providerType;
  
  // Save the active provider change
  const config = providerConfigs.value[providerType] || { apiKey: '', modelName: '', apiEndpoint: '' };
  vscodeApi.postMessage({
    command: 'saveProviderSettings',
    provider: providerType,
    apiKey: config.apiKey,
    modelName: config.modelName,
    apiEndpoint: config.apiEndpoint,
  });
  
  showSaveIndicator();
};

const toggleEdit = (providerType: string) => {
  if (editingProvider.value === providerType) {
    editingProvider.value = null;
  } else {
    editingProvider.value = providerType;
    // Load the config for this provider if not already loaded
    if (!providerConfigs.value[providerType]) {
      const providerInfo = getProviderInfo(providerType);
      providerConfigs.value[providerType] = {
        apiKey: '',
        modelName: '',
        apiEndpoint: providerInfo?.defaultEndpoint || '',
      };
    }
  }
};

const saveProviderConfig = (providerType: string) => {
  const config = providerConfigs.value[providerType];
  if (!config) return;
  
  vscodeApi.postMessage({
    command: 'saveProviderSettings',
    provider: providerType,
    apiKey: config.apiKey,
    modelName: config.modelName,
    apiEndpoint: config.apiEndpoint,
  });
  
  showSaveIndicator();
};

const showSaveIndicator = () => {
  saveIndicatorVisible.value = true;
  setTimeout(() => {
    saveIndicatorVisible.value = false;
  }, 2000);
};

// Message handler
const handleMessage = (event: MessageEvent) => {
  const message = event.data;
  
  switch (message.command) {
    case 'providerSettings':
      providers.value = message.providers || [];
      activeProvider.value = message.currentProvider || 'wca';
      
      // Initialize configs for all providers
      providers.value.forEach(provider => {
        if (!providerConfigs.value[provider.type]) {
          providerConfigs.value[provider.type] = {
            apiKey: '',
            modelName: '',
            apiEndpoint: provider.defaultEndpoint || '',
          };
        }
      });
      
      // Update the active provider's config with received values
      if (providerConfigs.value[activeProvider.value]) {
        providerConfigs.value[activeProvider.value] = {
          apiKey: message.apiKey || '',
          modelName: message.modelName || '',
          apiEndpoint: message.apiEndpoint || '',
        };
      }
      
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

      <div v-else class="provider-list">
        <!-- Provider Rows -->
        <div 
          v-for="provider in providers" 
          :key="provider.type" 
          class="provider-row"
          :class="{ 'is-active': activeProvider === provider.type, 'is-editing': editingProvider === provider.type }"
        >
          <!-- Provider Header Row -->
          <div class="provider-header">
            <div class="provider-info">
              <div class="provider-name">
                <span class="codicon codicon-server"></span>
                {{ provider.displayName }}
              </div>
              <div class="provider-description">{{ provider.description }}</div>
            </div>
            
            <div class="provider-actions">
              <button 
                class="action-btn edit-btn"
                :class="{ 'active': editingProvider === provider.type }"
                @click="toggleEdit(provider.type)"
                title="Edit configuration"
              >
                <span class="codicon codicon-edit"></span>
                Edit
              </button>
              
              <button 
                v-if="activeProvider !== provider.type"
                class="action-btn activate-btn"
                @click="setActiveProvider(provider.type)"
                title="Set as active provider"
              >
                <span class="codicon codicon-check"></span>
                Activate
              </button>
              
              <span v-else class="active-badge">
                <span class="codicon codicon-check-all"></span>
                Active
              </span>
            </div>
          </div>
          
          <!-- Provider Config Panel (shown when editing) -->
          <div v-if="editingProvider === provider.type" class="provider-config">
            <!-- API Endpoint -->
            <div class="config-field">
              <label :for="`api-endpoint-${provider.type}`" class="field-label">API Endpoint</label>
              <input 
                :id="`api-endpoint-${provider.type}`"
                v-model="providerConfigs[provider.type].apiEndpoint" 
                type="text" 
                class="text-input"
                :placeholder="provider.defaultEndpoint || 'Leave empty for default'"
                @blur="saveProviderConfig(provider.type)"
              />
              <p class="field-description">
                {{ provider.configSchema.find(c => c.key === 'apiEndpoint')?.description || 'API endpoint URL. Leave empty to use the default endpoint.' }}
              </p>
            </div>

            <!-- API Key (for non-WCA providers) -->
            <div v-if="needsApiKey(provider.type)" class="config-field">
              <label :for="`api-key-${provider.type}`" class="field-label">API Key</label>
              <input 
                :id="`api-key-${provider.type}`"
                v-model="providerConfigs[provider.type].apiKey" 
                type="password" 
                class="text-input"
                :placeholder="provider.configSchema.find(c => c.key === 'apiKey')?.placeholder || 'Enter your API key'"
                @blur="saveProviderConfig(provider.type)"
              />
              <p class="field-description">
                {{ provider.configSchema.find(c => c.key === 'apiKey')?.description }}
              </p>
            </div>

            <!-- Model Name (for non-WCA providers) -->
            <div v-if="needsApiKey(provider.type)" class="config-field">
              <label :for="`model-name-${provider.type}`" class="field-label">Model Name</label>
              <input 
                :id="`model-name-${provider.type}`"
                v-model="providerConfigs[provider.type].modelName" 
                type="text" 
                class="text-input"
                :placeholder="provider.configSchema.find(c => c.key === 'modelName')?.placeholder || 'Leave empty for default'"
                @blur="saveProviderConfig(provider.type)"
              />
              <p class="field-description">
                {{ provider.configSchema.find(c => c.key === 'modelName')?.description || 'Optional: Specify a model name to use. Leave empty to use the provider default.' }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Save indicator -->
      <div :class="['save-indicator', { visible: saveIndicatorVisible }]">
        <span class="codicon codicon-check"></span> Settings saved
      </div>
    </div>
  </div>
</template>
