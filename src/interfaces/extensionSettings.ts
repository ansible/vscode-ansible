export type IPullPolicy = "always" | "missing" | "never" | "tag";

export type IContainerEngine = "auto" | "podman" | "docker";

export interface ExtensionSettings {
  activationScript: string | undefined;
  interpreterPath: string | undefined;
  executionEnvironment: ExecutionEnvironmentSettings;
  lightSpeedService: LightSpeedServiceSettings;
  debugger: DebuggerSettings;
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

export interface LightSpeedServiceSettings {
  enabled: boolean;
  URL: string;
  suggestions: { enabled: boolean };
  model: string | undefined;
}

export interface DebuggerSettings {
  logFile: string | null;
  logLevel: string;
}
