export type IPullPolicy = "always" | "missing" | "never" | "tag";

export type IContainerEngine = "auto" | "podman" | "docker";

export interface ExtensionSettings {
  activationScript: string;
  interpreterPath: string;
  executionEnvironment: ExecutionEnvironmentSettings;
  wisdomService: WisdomServiceSettings
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

export interface WisdomServiceSettings {
  enabled: boolean;
  basePath: string;
  authToken: string | undefined;
  suggestions: { enabled: boolean, userFeedback: boolean };
}
