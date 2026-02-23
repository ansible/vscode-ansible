<script setup lang="ts">
import '@vscode/codicons/dist/codicon.css';
import type { ProviderInfo } from './llmProviderState';

defineProps<{
  provider: ProviderInfo;
  getConfigValue: (providerType: string, fieldKey: string) => string;
  hasChanges: boolean;
}>();

const emit = defineEmits<{
  'update:field': [fieldKey: string, value: string];
  save: [];
  cancel: [];
}>();
</script>

<template>
  <div class="provider-config">
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
        @input="emit('update:field', field.key, ($event.target as HTMLInputElement).value)"
        :type="field.type === 'password' ? 'password' : 'text'"
        class="text-input"
        :placeholder="field.placeholder || ''"
      />
      <p v-if="field.description" class="field-description">
        {{ field.description }}
      </p>
    </div>

    <!-- Save and Cancel Buttons -->
    <div class="config-actions">
      <button
        class="action-btn save-btn"
        :class="{ 'has-changes': hasChanges }"
        @click="emit('save')"
        title="Save configuration"
      >
        <span class="codicon codicon-save"></span>
        Save
      </button>
      <button
        class="action-btn cancel-btn"
        @click="emit('cancel')"
        title="Cancel and close"
      >
        Cancel
      </button>
      <span v-if="hasChanges" class="unsaved-indicator">
        Unsaved changes
      </span>
    </div>
  </div>
</template>

<style scoped>
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

/* Button styles for save/cancel */
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

.save-btn {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.save-btn:hover {
  background-color: var(--vscode-button-hoverBackground);
}

.save-btn.has-changes {
  background-color: var(--vscode-inputValidation-warningBackground);
  border-color: var(--vscode-inputValidation-warningBorder);
  color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground));
}

.cancel-btn {
  background-color: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  margin-left: 8px;
}

.cancel-btn:hover {
  background-color: var(--vscode-button-secondaryHoverBackground);
}

.unsaved-indicator {
  font-size: 12px;
  color: var(--vscode-inputValidation-warningForeground, var(--vscode-editorWarning-foreground));
  font-style: italic;
}
</style>
