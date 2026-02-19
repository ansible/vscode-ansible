import { onMounted, ref } from 'vue';
import { vscodeApi } from '../utils';

// Types
export interface ConfigSchemaField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  placeholder: string;
  description: string;
}

export interface ProviderInfo {
  type: string;
  name: string;
  displayName: string;
  description: string;
  defaultEndpoint: string;
  configSchema: ConfigSchemaField[];
  usesOAuth?: boolean;
  requiresApiKey?: boolean;
}

export type ProviderConfig = Record<string, string>;

export function useProviderSettings() {
  const providers = ref<ProviderInfo[]>([]);
  const activeProvider = ref<string>('wca');
  const editingProvider = ref<string | null>(null);
  const isLoading = ref<boolean>(true);
  const saveIndicatorVisible = ref<boolean>(false);
  const connectingProvider = ref<string | null>(null);

  const providerConfigs = ref<Record<string, ProviderConfig>>({});

  const originalConfigs = ref<Record<string, ProviderConfig>>({});

  const connectionStatuses = ref<Record<string, boolean>>({});

  // Computed helpers
  const getProviderInfo = (type: string) => {
    return providers.value.find((p) => p.type === type);
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

    for (const field of provider.configSchema) {
      if ((current[field.key] || '') !== (original[field.key] || '')) {
        return true;
      }
    }
    return false;
  };

  // Get config value for a field
  const getConfigValue = (
    providerType: string,
    fieldKey: string,
  ): string => {
    return providerConfigs.value[providerType]?.[fieldKey] || '';
  };

  // Set config value for a field
  const setConfigValue = (
    providerType: string,
    fieldKey: string,
    value: string,
  ): void => {
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

  const showSaveIndicator = () => {
    saveIndicatorVisible.value = true;
    setTimeout(() => {
      saveIndicatorVisible.value = false;
    }, 2000);
  };

  const setActiveProvider = (providerType: string) => {
    activeProvider.value = providerType;

    // Only activate the provider
    vscodeApi.postMessage({
      command: 'activateProvider',
      provider: providerType,
    });

    showSaveIndicator();
  };

  const toggleEdit = (providerType: string) => {
    if (editingProvider.value === providerType) {
      // Closing edit panel
      if (originalConfigs.value[providerType]) {
        providerConfigs.value[providerType] = {
          ...originalConfigs.value[providerType],
        };
      }
      editingProvider.value = null;
    } else {
      // If switching from another provider's edit, discard that provider's unsaved changes
      if (
        editingProvider.value &&
        originalConfigs.value[editingProvider.value]
      ) {
        providerConfigs.value[editingProvider.value] = {
          ...originalConfigs.value[editingProvider.value],
        };
      }

      editingProvider.value = providerType;
      const providerInfo = getProviderInfo(providerType);

      // Initialize config from configSchema if not already loaded
      if (!providerConfigs.value[providerType]) {
        const config: ProviderConfig = {};
        providerInfo?.configSchema.forEach((field) => {
          // Use defaultEndpoint for apiEndpoint field, empty string for others
          config[field.key] =
            field.key === 'apiEndpoint'
              ? (providerInfo?.defaultEndpoint || '')
              : '';
        });
        providerConfigs.value[providerType] = config;
      }

      // Store original values to compare against for change detection
      originalConfigs.value[providerType] = {
        ...providerConfigs.value[providerType],
      };
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
    provider.configSchema.forEach((field) => {
      configToSend[field.key] = config[field.key] || '';
    });

    vscodeApi.postMessage({
      command: 'saveProviderSettings',
      provider: providerType,
      config: configToSend,
    });

    // Update original config to match saved values
    originalConfigs.value[providerType] = { ...config };

    // Reset connection status if config actually changed
    if (hadChanges) {
      connectionStatuses.value[providerType] = false;
    }

    showSaveIndicator();
  };

  const connectProvider = (providerType: string) => {
    connectingProvider.value = providerType;
    activeProvider.value = providerType;

    vscodeApi.postMessage({
      command: 'connectProvider',
      provider: providerType,
    });
  };

  // Message handler
  const handleMessage = (event: MessageEvent) => {
    const message = event.data;

    switch (message.command) {
      case 'providerSettings': {
        providers.value = message.providers || [];
        activeProvider.value = message.currentProvider || 'wca';
        connectionStatuses.value = message.connectionStatuses || {};

        // Load configs for ALL providers from backend, using configSchema as the field source
        const backendConfigs = message.providerConfigs || {};

        providers.value.forEach((provider) => {
          const backendConfig = backendConfigs[provider.type] || {};
          const config: ProviderConfig = {};

          // Initialize each field from configSchema with backend value or default
          provider.configSchema.forEach((field) => {
            if (field.key === 'apiEndpoint') {
              config[field.key] =
                backendConfig[field.key] || provider.defaultEndpoint || '';
            } else {
              config[field.key] = backendConfig[field.key] || '';
            }
          });

          providerConfigs.value[provider.type] = config;

          originalConfigs.value[provider.type] = { ...config };
        });

        isLoading.value = false;
        connectingProvider.value = null;
        break;
      }

      case 'connectionResult':
        connectingProvider.value = null;
        if (message.connected) {
          connectionStatuses.value[message.provider] = true;
        } else {
          connectionStatuses.value[message.provider] = false;
          console.error(
            `Connection failed for ${message.provider}: ${message.error}`,
          );
        }
        break;
    }
  };

  onMounted(() => {
    loadProviderSettings();
    window.addEventListener('message', handleMessage);
  });

  return {
    // State
    providers,
    activeProvider,
    editingProvider,
    isLoading,
    saveIndicatorVisible,
    // Helpers
    isConnected,
    isConnecting,
    hasUnsavedChanges,
    getConfigValue,
    setConfigValue,
    // Actions
    setActiveProvider,
    toggleEdit,
    saveProviderConfig,
    connectProvider,
  };
}
