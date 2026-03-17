import type {
  IPullPolicy,
  IContainerEngine,
} from "@ansible/ansible-language-server/src/interfaces/extensionSettings";

interface ExtensionSettings {
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

interface ExecutionEnvironmentSettings {
  enabled: boolean;
  containerEngine: IContainerEngine;
  containerOptions: string;
  image: string;
  pull: { arguments: string; policy: IPullPolicy };
  volumeMounts: Array<IVolumeMounts>;
}

interface PlaybookSettings {
  arguments: string;
}

// Settings appear on VS Code Settings UI
interface LightSpeedServiceSettings {
  enabled: boolean;
  provider: string; // 'wca' | 'google' | 'rhcustom'
  apiEndpoint: string;
  modelName: string | undefined;
  apiKey: string; // For third-party providers like Google, Red Hat AI
  maxTokens?: number; // For Red Hat AI and other API-key providers
  timeout: number; // Request timeout in milliseconds
  suggestions: { enabled: boolean; waitWindow: number };
}

interface McpServerSettings {
  enabled: boolean;
}
