export type IPullPolicy = "always" | "missing" | "never" | "tag";

export type IContainerEngine = "auto" | "podman" | "docker";

export interface ExtensionSettings {
  activationScript: string | undefined;
  interpreterPath: string | undefined;
  executionEnvironment: ExecutionEnvironmentSettings;
  lightSpeedService: LightSpeedServiceSettings;
  playbook: PlaybookSettings;
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
  URL: string;
  suggestions: { enabled: boolean; waitWindow: number };
  model: string | undefined;
}
