<script setup lang="ts">
import { onMounted, ref } from 'vue';
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
const connectingProvider = ref<string | null>(null);

// Provider-specific configs (stored locally for editing)
const providerConfigs = ref<Record<string, ProviderConfig>>({});

// Original configs (to compare against for detecting actual changes)
const originalConfigs = ref<Record<string, ProviderConfig>>({});

// Connection status per provider
const connectionStatuses = ref<Record<string, boolean>>({});

// Computed
const getProviderInfo = (type: string) => {
  return providers.value.find(p => p.type === type);
};

const needsApiKey = (providerType: string) => {
  return providerType !== 'wca';
};

const isConnected = (providerType: string) => {
  return connectionStatuses.value[providerType] ?? false;
};

const isConnecting = (providerType: string) => {
  return connectingProvider.value === providerType;
};

const hasUnsavedChanges = (providerType: string) => {
  const current = providerConfigs.value[providerType];
  const original = originalConfigs.value[providerType];
  
  if (!original || !current) return false;
  
  return (
    current.apiKey !== original.apiKey ||
    current.modelName !== original.modelName ||
    current.apiEndpoint !== original.apiEndpoint
  );
};

// Methods
const loadProviderSettings = () => {
  vscodeApi.postMessage({
    command: 'getProviderSettings',
  });
};

const setActiveProvider = (providerType: string) => {
  activeProvider.value = providerType;
  
  // Only activate the provider (don't reset connection status)
  vscodeApi.postMessage({
    command: 'activateProvider',
    provider: providerType,
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
    // Store original values to compare against for change detection
    originalConfigs.value[providerType] = {
      apiKey: providerConfigs.value[providerType].apiKey,
      modelName: providerConfigs.value[providerType].modelName,
      apiEndpoint: providerConfigs.value[providerType].apiEndpoint,
    };
  }
};

const saveProviderConfig = (providerType: string) => {
  const config = providerConfigs.value[providerType];
  if (!config) return;
  
  // Check if there are actual changes before saving
  const hadChanges = hasUnsavedChanges(providerType);
  
  vscodeApi.postMessage({
    command: 'saveProviderSettings',
    provider: providerType,
    apiKey: config.apiKey,
    modelName: config.modelName,
    apiEndpoint: config.apiEndpoint,
  });
  
  // Update original config to match saved values
  originalConfigs.value[providerType] = {
    apiKey: config.apiKey,
    modelName: config.modelName,
    apiEndpoint: config.apiEndpoint,
  };
  
  // Reset connection status if config actually changed (require re-connect)
  if (hadChanges) {
    connectionStatuses.value[providerType] = false;
  }
  
  showSaveIndicator();
};

// Track config changes (no longer auto-resets connection status - that happens on Save)
const onConfigChange = (_providerType: string) => {
  // Just trigger reactivity for hasUnsavedChanges
  // Connection status will be reset when user explicitly clicks Save
};

const showSaveIndicator = () => {
  saveIndicatorVisible.value = true;
  setTimeout(() => {
    saveIndicatorVisible.value = false;
  }, 2000);
};

const connectProvider = (providerType: string) => {
  connectingProvider.value = providerType;
  activeProvider.value = providerType;
  
  // Just tell backend to connect - it uses its own stored values
  vscodeApi.postMessage({
    command: 'connectProvider',
    provider: providerType,
  });
};

// Message handler
const handleMessage = (event: MessageEvent) => {
  const message = event.data;
  
  switch (message.command) {
    case 'providerSettings':
      providers.value = message.providers || [];
      activeProvider.value = message.currentProvider || 'wca';
      connectionStatuses.value = message.connectionStatuses || {};
      
      // Load configs for ALL providers from backend
      const backendConfigs = message.providerConfigs || {};
      
      providers.value.forEach(provider => {
        const backendConfig = backendConfigs[provider.type];
        if (backendConfig) {
          // Use backend values
          providerConfigs.value[provider.type] = {
            apiKey: backendConfig.apiKey || '',
            modelName: backendConfig.modelName || '',
            apiEndpoint: backendConfig.apiEndpoint || provider.defaultEndpoint || '',
          };
        } else {
          // Fallback to defaults
          providerConfigs.value[provider.type] = {
            apiKey: '',
            modelName: '',
            apiEndpoint: provider.defaultEndpoint || '',
          };
        }
        // Also update original configs to match
        originalConfigs.value[provider.type] = { ...providerConfigs.value[provider.type] };
      });
      
      isLoading.value = false;
      connectingProvider.value = null;
      break;
      
    case 'connectionResult':
      connectingProvider.value = null;
      if (message.connected) {
        connectionStatuses.value[message.provider] = true;
      } else {
        connectionStatuses.value[message.provider] = false;
        // Could show error message here if needed
        console.error(`Connection failed for ${message.provider}: ${message.error}`);
      }
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
              
              <!-- Connect button: shown when not connected -->
              <button 
                v-if="!isConnected(provider.type)"
                class="action-btn connect-btn"
                :disabled="isConnecting(provider.type)"
                @click="connectProvider(provider.type)"
                title="Connect to provider"
              >
                <span v-if="isConnecting(provider.type)" class="codicon codicon-loading codicon-modifier-spin"></span>
                <span v-else class="codicon codicon-plug"></span>
                {{ isConnecting(provider.type) ? 'Connecting...' : 'Connect' }}
              </button>
              
              <!-- Activate button: shown when connected but not active -->
              <button 
                v-else-if="activeProvider !== provider.type"
                class="action-btn activate-btn"
                @click="setActiveProvider(provider.type)"
                title="Set as active provider"
              >
                <span class="codicon codicon-check"></span>
                Activate
              </button>
              
              <!-- Active badge: shown when provider is active -->
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
                @input="onConfigChange(provider.type)"
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
                @input="onConfigChange(provider.type)"
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
                @input="onConfigChange(provider.type)"
              />
              <p class="field-description">
                {{ provider.configSchema.find(c => c.key === 'modelName')?.description || 'Optional: Specify a model name to use. Leave empty to use the provider default.' }}
              </p>
            </div>

            <!-- Save Button -->
            <div class="config-actions">
              <button 
                class="action-btn save-btn"
                :class="{ 'has-changes': hasUnsavedChanges(provider.type) }"
                @click="saveProviderConfig(provider.type)"
                title="Save configuration"
              >
                <span class="codicon codicon-save"></span>
                Save
              </button>
              <span v-if="hasUnsavedChanges(provider.type)" class="unsaved-indicator">
                Unsaved changes
              </span>
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
