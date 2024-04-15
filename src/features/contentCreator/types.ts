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

export type AnsibleProjectInterface = {
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
