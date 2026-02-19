<script setup lang="ts">
import '@vscode/codicons/dist/codicon.css';
import { useProviderSettings } from './lightspeed/src/components/llmProviderState';
import ProviderConfigForm from './lightspeed/src/components/ProviderConfigForm.vue';
import SpinnerLoading from './lightspeed/src/components/SpinnerLoading.vue';
import ToastNotification from './lightspeed/src/components/ToastNotification.vue';

const {
  providers,
  activeProvider,
  editingProvider,
  isLoading,
  saveIndicatorVisible,
  isConnected,
  isConnecting,
  hasUnsavedChanges,
  getConfigValue,
  setConfigValue,
  setActiveProvider,
  toggleEdit,
  saveProviderConfig,
  connectProvider,
} = useProviderSettings();
</script>

<template>
  <div id="llmProviderView">
    <div class="settings-wrapper">
      <header class="settings-header">
        <h1>LLM Provider Settings</h1>
        <p>Configure which AI provider powers Ansible Lightspeed features like code completion and playbook generation.</p>
      </header>

      <SpinnerLoading v-if="isLoading" message="Loading provider settings..." />

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
                <span class="codicon codicon-plug"></span>
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
          <ProviderConfigForm
            v-if="editingProvider === provider.type"
            :provider="provider"
            :get-config-value="getConfigValue"
            :has-changes="hasUnsavedChanges(provider.type)"
            @update:field="(fieldKey: string, value: string) => setConfigValue(provider.type, fieldKey, value)"
            @save="saveProviderConfig(provider.type)"
            @cancel="toggleEdit(provider.type)"
          />
        </div>
      </div>

      <!-- Save indicator -->
      <ToastNotification :visible="saveIndicatorVisible" message="Settings saved" />
    </div>
  </div>
</template>

<style scoped>
/* LLM Provider Settings */

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
.switch-btn {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.connect-btn:hover:not(:disabled),
.switch-btn:hover {
  background-color: var(--vscode-button-hoverBackground);
}

.connect-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
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

</style>
