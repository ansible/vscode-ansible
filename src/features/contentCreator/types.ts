export type AnsibleCreatorInitInterface = {
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
        collectionUrl: string;
        status: string;
      };
      data?: string;
    };
