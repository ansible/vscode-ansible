export type IPullPolicy = "always" | "missing" | "never" | "tag";

export type IContainerEngine = "auto" | "podman" | "docker";

export interface ExtensionSettings {
  activationScript: string;
  interpreterPath: string;
  executionEnvironment: ExecutionEnvironmentSettings;
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
