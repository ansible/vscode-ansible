export type IPullPolicy = "always" | "missing" | "never" | "tag";

export type IContainerEngine = "auto" | "podman" | "docker";

export interface ExtensionSettings {
  activationScript: string | undefined;
  interpreterPath: string | undefined;
  executionEnvironment: ExecutionEnvironmentSettings;
  lightSpeedService: LightSpeedServiceSettings;
  playbook: PlaybookSettings;
  mcpServer: McpServerSettings;
}

export interface IVolumeMounts {
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

export interface UserResponse {
  rh_org_has_subscription: boolean;
  rh_user_has_seat: boolean;
  rh_user_is_org_admin: boolean;
  external_username: string;
  username: string;
  org_telemetry_opt_out: boolean;
}

// Settings appear on VS Code Settings UI
export interface LightSpeedServiceSettings {
  enabled: boolean;
  provider: string; // 'wca' | 'google' | 'custom'
  URL: string;
  apiEndpoint: string;
  modelName: string | undefined;
  model: string | undefined; // Legacy field for backwards compatibility
  apiKey: string; // For third-party providers like Google
  timeout: number; // Request timeout in milliseconds
  customHeaders: Record<string, string>; // Custom headers for third-party providers
  suggestions: { enabled: boolean; waitWindow: number };
  playbookGenerationCustomPrompt: string | undefined;
  playbookExplanationCustomPrompt: string | undefined;
}

export interface McpServerSettings {
  enabled: boolean;
}
