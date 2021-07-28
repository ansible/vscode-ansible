export interface ExtensionSettings {
  ansible: { path: string; useFullyQualifiedCollectionNames: boolean };
  ansibleLint: { enabled: boolean; path: string; arguments: string };
  python: { interpreterPath: string; activationScript: string };
}
