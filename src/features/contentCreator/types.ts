export type AnsibleCollectionFormInterface = {
  namespaceName: string;
  collectionName: string;
  initPath: string;
  verbosity: string;
  logToFile: boolean;
  logFilePath: string;
  logFileAppend: boolean;
  logLevel: string;
  isForced: boolean;
  isEditableModeInstall: boolean;
};

export type AnsibleProjectFormInterface = {
  destinationPath: string;
  scmOrgName: string;
  scmProjectName: string;
  verbosity: string;
  logToFile: boolean;
  logFilePath: string;
  logFileAppend: boolean;
  logLevel: string;
  isForced: boolean;
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
    };
