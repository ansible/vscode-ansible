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
