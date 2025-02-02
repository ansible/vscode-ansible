export type AnsibleCollectionFormInterface = {
  namespaceName: string;
  collectionName: string;
  initPath: string;
  verbosity: string;
  logToFile: boolean;
  logFilePath: string;
  logFileAppend: boolean;
  logLevel: string;
  isOverwritten: boolean;
  isEditableModeInstall: boolean;
};

export type AnsibleProjectFormInterface = {
  destinationPath: string;
  namespaceName: string;
  collectionName: string;
  verbosity: string;
  logToFile: boolean;
  logFilePath: string;
  logFileAppend: boolean;
  logLevel: string;
  isOverwritten: boolean;
};

export type DevfileFormInterface = {
  destinationPath: string;
  name: string;
  image: string;
  isOverwritten: boolean;
};

export type AnsibleExecutionEnvInterface = {
  destinationPath: string;
  verbosity: string;
  isOverwritten: boolean;
  isCreateContextEnabled: boolean;
  isBuildImageEnabled: boolean;
  baseImage: string;
  customBaseImage: string;
  collections: string;
  systemPackages: string;
  pythonPackages: string;
  tag: string;
};

export type DevcontainerFormInterface = {
  destinationPath: string;
  image: string;
  isOverwritten: boolean;
};

export type PluginFormInterface = {
  pluginName: string;
  pluginType: string;
  collectionPath: string;
  verbosity: string;
  isOverwritten: boolean;
};

export type PostMessageEvent =
  | {
      command: "ADEPresence";
      arguments: boolean;
    }
  | {
      command: "execution-log";
      arguments: {
        commandOutput: string;
        logFileUrl: string;
        collectionUrl?: string;
        projectUrl?: string;
        status: string;
      };
      data?: string;
    }
  | {
      command: "file-uri";
      arguments: { selectedUri: string | undefined };
    }
  | {
      command: "disable-build-button";
      arguments?: never;
    }
  | {
      command: "enable-build-button";
      arguments?: never;
    };
