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
};

export type AnsibleProjectInterface = {
  projectName: string;
  initPath: string;
  verbosity: string;
  logToFile: boolean;
  logFilePath: string;
  logFileAppend: boolean;
  logLevel: string;
  isForced: boolean;
};
