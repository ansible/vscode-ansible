<script setup lang="ts">
import '@vscode/codicons/dist/codicon.css';
import { onMounted, ref } from 'vue';
import { vscodeApi } from './lightspeed/src/utils';

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
  usesOAuth?: boolean;
  requiresApiKey?: boolean;
}

// Dynamic config - fields are driven by configSchema
type ProviderConfig = Record<string, string>;

// State
const providers = ref<ProviderInfo[]>([]);
const activeProvider = ref<string>('wca');
const editingProvider = ref<string | null>(null);
const isLoading = ref<boolean>(true);
const saveIndicatorVisible = ref<boolean>(false);
const connectingProvider = ref<string | null>(null);

// Provider-specific configs (stored locally for editing) - dynamic fields from configSchema
const providerConfigs = ref<Record<string, ProviderConfig>>({});

// Original configs (to compare against for detecting actual changes)
const originalConfigs = ref<Record<string, ProviderConfig>>({});

// Connection status per provider
const connectionStatuses = ref<Record<string, boolean>>({});

// Computed
const getProviderInfo = (type: string) => {
  return providers.value.find(p => p.type === type);
};

const isConnected = (providerType: string) => {
  return connectionStatuses.value[providerType] ?? false;
};

const isConnecting = (providerType: string) => {
  return connectingProvider.value === providerType;
};

// Compare all fields from configSchema to detect changes
const hasUnsavedChanges = (providerType: string) => {
  const provider = getProviderInfo(providerType);
  const current = providerConfigs.value[providerType];
  const original = originalConfigs.value[providerType];
  
  if (!provider || !original || !current) return false;
  
  // Compare each field defined in configSchema
  for (const field of provider.configSchema) {
    if ((current[field.key] || '') !== (original[field.key] || '')) {
      return true;
    }
  }
  return false;
};

// Get config value for a field (used in template)
const getConfigValue = (providerType: string, fieldKey: string): string => {
  return providerConfigs.value[providerType]?.[fieldKey] || '';
};

// Set config value for a field (used in template)
const setConfigValue = (providerType: string, fieldKey: string, value: string): void => {
  if (!providerConfigs.value[providerType]) {
    providerConfigs.value[providerType] = {};
  }
  providerConfigs.value[providerType][fieldKey] = value;
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
    // Closing edit panel - discard any unsaved changes by restoring original values
    if (originalConfigs.value[providerType]) {
      providerConfigs.value[providerType] = { ...originalConfigs.value[providerType] };
    }
    editingProvider.value = null;
  } else {
    // If switching from another provider's edit, discard that provider's unsaved changes
    if (editingProvider.value && originalConfigs.value[editingProvider.value]) {
      providerConfigs.value[editingProvider.value] = { ...originalConfigs.value[editingProvider.value] };
    }
    
    editingProvider.value = providerType;
    const providerInfo = getProviderInfo(providerType);
    
    // Initialize config from configSchema if not already loaded
    if (!providerConfigs.value[providerType]) {
      const config: ProviderConfig = {};
      providerInfo?.configSchema.forEach(field => {
        // Use defaultEndpoint for apiEndpoint field, empty string for others
        config[field.key] = field.key === 'apiEndpoint' 
          ? (providerInfo?.defaultEndpoint || '') 
          : '';
      });
      providerConfigs.value[providerType] = config;
    }
    
    // Store original values to compare against for change detection
    originalConfigs.value[providerType] = { ...providerConfigs.value[providerType] };
  }
};

const saveProviderConfig = (providerType: string) => {
  const config = providerConfigs.value[providerType];
  const provider = getProviderInfo(providerType);
  if (!config || !provider) return;
  
  // Check if there are actual changes before saving
  const hadChanges = hasUnsavedChanges(providerType);
  
  // Build config object from configSchema fields
  const configToSend: Record<string, string> = {};
  provider.configSchema.forEach(field => {
    configToSend[field.key] = config[field.key] || '';
  });
  
  vscodeApi.postMessage({
    command: 'saveProviderSettings',
    provider: providerType,
    config: configToSend,
  });
  
  // Update original config to match saved values
  originalConfigs.value[providerType] = { ...config };
  
  // Reset connection status if config actually changed (require re-connect)
  if (hadChanges) {
    connectionStatuses.value[providerType] = false;
  }
  
  showSaveIndicator();
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
      
      // Load configs for ALL providers from backend, using configSchema as the field source
      const backendConfigs = message.providerConfigs || {};
      
      providers.value.forEach(provider => {
        const backendConfig = backendConfigs[provider.type] || {};
        const config: ProviderConfig = {};
        
        // Initialize each field from configSchema with backend value or default
        provider.configSchema.forEach(field => {
          if (field.key === 'apiEndpoint') {
            config[field.key] = backendConfig[field.key] || provider.defaultEndpoint || '';
          } else {
            config[field.key] = backendConfig[field.key] || '';
          }
        });
        
        providerConfigs.value[provider.type] = config;
        // Also update original configs to match
        originalConfigs.value[provider.type] = { ...config };
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
          :class="{ 'is-editing': editingProvider === provider.type }"
        >
          <!-- Provider Header Row -->
          <div class="provider-header">
            <div class="provider-info">
              <div class="provider-name">
                {{ provider.displayName }}
                <!-- Configured badge: shown when connected -->
                <span v-if="isConnected(provider.type)" class="configured-badge">
                  <span class="codicon codicon-check"></span>
                  Configured
                </span>
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
              
              <!-- Switch button: shown when connected but not active -->
              <button 
                v-else-if="activeProvider !== provider.type"
                class="action-btn switch-btn"
                @click="setActiveProvider(provider.type)"
                title="Switch to this provider"
              >
                Switch to this Provider
              </button>
              
              <!-- Active badge: shown when provider is active -->
              <span v-else class="active-badge">
                <span class="codicon codicon-check"></span>
                Active
              </span>
            </div>
          </div>
          
          <!-- Provider Config Panel (shown when editing) -->
          <div v-if="editingProvider === provider.type" class="provider-config">
            <!-- Dynamically render fields from configSchema -->
            <div 
              v-for="field in provider.configSchema" 
              :key="field.key" 
              class="config-field"
            >
              <label :for="`${field.key}-${provider.type}`" class="field-label">
                {{ field.label }}
                <span v-if="field.required" class="required-indicator">*</span>
              </label>
              <input 
                :id="`${field.key}-${provider.type}`"
                :value="getConfigValue(provider.type, field.key)"
                @input="setConfigValue(provider.type, field.key, ($event.target as HTMLInputElement).value)"
                :type="field.type === 'password' ? 'password' : 'text'" 
                class="text-input"
                :placeholder="field.placeholder || ''"
              />
              <p v-if="field.description" class="field-description">
                {{ field.description }}
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

<style scoped>
/* LLM Provider Settings - Optimized CSS */

/* Base container */
#llmProviderView {
  display: flex;
  justify-content: center;
  padding: 32px 24px;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  min-height: 100vh;
}

.settings-wrapper {
  width: 100%;
  max-width: 700px;
}

/* Header */
.settings-header {
  margin-bottom: 32px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--vscode-widget-border);
}

.settings-header h1 {
  font-size: 24px;
  font-weight: 400;
  margin-bottom: 8px;
}

.settings-header p {
  font-size: 13px;
  color: var(--vscode-descriptionForeground);
  margin: 0;
  line-height: 1.5;
}

/* Loading state */
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 20px;
  color: var(--vscode-descriptionForeground);
}

/* Provider list & rows */
.provider-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.provider-row {
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.2s ease;
}

.provider-row:hover,
.provider-row.is-editing {
  border-color: var(--vscode-focusBorder);
}

/* Provider header */
.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  gap: 16px;
}

.provider-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.provider-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}

.provider-description {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  line-height: 1.4;
}

/* Provider actions */
.provider-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Base button styles */
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 4px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 0.15s ease;
  background-color: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.action-btn:hover {
  background-color: var(--vscode-button-secondaryHoverBackground);
}

.action-btn .codicon {
  font-size: 14px;
}

/* Primary button variants */
.edit-btn.active,
.connect-btn,
.switch-btn,
.save-btn {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.connect-btn:hover:not(:disabled),
.switch-btn:hover,
.save-btn:hover {
  background-color: var(--vscode-button-hoverBackground);
}

.connect-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.save-btn.has-changes {
  background-color: var(--vscode-inputValidation-warningBackground);
  border-color: var(--vscode-inputValidation-warningBorder);
  color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground));
}

/* Badges - shared base */
.configured-badge,
.active-badge {
  display: inline-flex;
  align-items: center;
  font-weight: 500;
  border-radius: 12px;
}

.configured-badge {
  gap: 4px;
  margin-left: 10px;
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid var(--vscode-charts-green);
  color: var(--vscode-charts-green);
}

.active-badge {
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 4px;
  background-color: var(--vscode-charts-green);
  color: var(--vscode-editor-background);
}

.configured-badge .codicon { font-size: 12px; }
.active-badge .codicon { font-size: 14px; }

/* Config panel */
.provider-config {
  padding: 0 16px 16px;
  border-top: 1px solid var(--vscode-widget-border);
  background-color: var(--vscode-sideBar-background);
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Form fields */
.config-field {
  margin-top: 16px;
}

.field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
}

.required-indicator {
  color: var(--vscode-errorForeground, #f44336);
  margin-left: 2px;
  font-weight: normal;
}

.text-input {
  width: 100%;
  padding: 8px 12px;
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
  border-radius: 4px;
  font-size: 13px;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}

.text-input:hover,
.text-input:focus {
  border-color: var(--vscode-focusBorder);
}

.text-input:focus {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}

.text-input::placeholder {
  color: var(--vscode-input-placeholderForeground);
}

.field-description {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-top: 6px;
  line-height: 1.4;
}

/* Config actions */
.config-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--vscode-widget-border);
}

.unsaved-indicator {
  font-size: 12px;
  color: var(--vscode-inputValidation-warningForeground, var(--vscode-editorWarning-foreground));
  font-style: italic;
}

/* Toast notification */
.save-indicator {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background-color: var(--vscode-charts-green);
  color: var(--vscode-editor-background);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
}

.save-indicator.visible {
  opacity: 1;
  transform: translateY(0);
}

/* Spinner animation */
.codicon-modifier-spin {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}
</style>
