export type IContainerEngine = 'auto' | 'podman' | 'docker';

export type IPullPolicy = 'always' | 'missing' | 'never' | 'tag';

export interface ExtensionSettings {
  ansible: { path: string; useFullyQualifiedCollectionNames: boolean };
  ansibleLint: { enabled: boolean; path: string; arguments: string };
  executionEnvironment: ExecutionEnvironmentSettings;
  python: { interpreterPath: string; activationScript: string };
}

interface ExecutionEnvironmentSettings {
  containerEngine: IContainerEngine;
  enabled: boolean;
  image: string;
  pullPolicy: IPullPolicy;
}
