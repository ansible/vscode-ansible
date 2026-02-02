import type {
  IPullPolicy,
  IContainerEngine,
} from "@ansible/ansible-language-server/src/interfaces/extensionSettings";

export interface ExtensionSettings {
  activationScript: string | undefined;
  interpreterPath: string | undefined;
  executionEnvironment: ExecutionEnvironmentSettings;
  lightSpeedService: LightSpeedServiceSettings;
  playbook: PlaybookSettings;
  mcpServer: McpServerSettings;
}

interface IVolumeMounts {
  src: string;
  dest: string;
  options: string | undefined;
}

export interface ExecutionEnvironmentSettings {
  enabled: boolean;
  containerEngine: IContainerEngine;
  containerOptions: string;
  image: string;
  pull: { arguments: string; policy: IPullPolicy };
  volumeMounts: Array<IVolumeMounts>;
}

export interface PlaybookSettings {
  arguments: string;
}

// Settings appear on VS Code Settings UI
export interface LightSpeedServiceSettings {
  enabled: boolean;
  provider: string; // 'wca' | 'google' | 'custom'
  apiEndpoint: string;
  modelName: string | undefined;
  apiKey: string; // For third-party providers like Google
  timeout: number; // Request timeout in milliseconds
  suggestions: { enabled: boolean; waitWindow: number };
}

export interface McpServerSettings {
  enabled: boolean;
}
