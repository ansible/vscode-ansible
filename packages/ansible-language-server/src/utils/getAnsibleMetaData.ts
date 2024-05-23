import { Connection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { WorkspaceFolderContext } from "../services/workspaceManager";
import { CommandRunner } from "./commandRunner";
import * as child_process from "child_process";

let context: WorkspaceFolderContext;
let connection: Connection | undefined;

export interface ansibleMetaDataEntryType {
  [name: string]:
    | {
        [name: string]: string | string[] | undefined | object[];
      }
    | string
    | string[]
    | object[]
    | undefined;
}

export interface ansibleMetaDataType {
  "ansible information"?: ansibleMetaDataEntryType;
  "python information"?: ansibleMetaDataEntryType;
  "ansible-lint information"?: ansibleMetaDataEntryType;
  "execution environment information"?: ansibleMetaDataEntryType | undefined;
}

export async function getAnsibleMetaData(
  contextLocal: WorkspaceFolderContext,
  connectionLocal: Connection | undefined,
): Promise<ansibleMetaDataType> {
  context = contextLocal;
  connection = connectionLocal;

  const ansibleMetaData: ansibleMetaDataType = {
    "ansible information": await getAnsibleInfo(),
    "python information": await getPythonInfo(),
    "ansible-lint information": await getAnsibleLintInfo(),
  };

  const settings = await context.documentSettings.get(
    context.workspaceFolder.uri,
  );

  if (settings.executionEnvironment.enabled) {
    ansibleMetaData["execution environment information"] =
      await getExecutionEnvironmentInfo();
  }

  return ansibleMetaData;
}

export async function getResultsThroughCommandRunner(cmd: string, arg: string) {
  const settings = await context.documentSettings.get(
    context.workspaceFolder.uri,
  );
  const commandRunner = new CommandRunner(connection, context, settings);
  const workingDirectory = URI.parse(context.workspaceFolder.uri).path;
  const mountPaths = new Set([workingDirectory]);

  let result;
  try {
    result = await commandRunner.runCommand(
      cmd,
      arg,
      workingDirectory,
      mountPaths,
    );

    if (result.stderr) {
      console.log(
        `cmd '${cmd} ${arg}' has the following error/warning: ${result.stderr}`,
      );
      return result;
    }
  } catch (error) {
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }
    console.log(
      `cmd '${cmd} ${arg}' was not executed with the following error: ' ${errorMessage}`,
    );
    return undefined;
  }

  return result;
}

async function getAnsibleInfo() {
  const ansibleInfo: ansibleMetaDataEntryType = {};

  const ansibleVersionObj = (await context.ansibleConfig).ansible_meta_data;
  const ansibleVersionObjKeys = Object.keys(ansibleVersionObj);

  // return empty if ansible --version fails to execute
  if (ansibleVersionObjKeys.length === 0) {
    return ansibleInfo;
  }

  let ansibleCoreVersion: string[] = [];
  if (ansibleVersionObjKeys[0].includes(" [")) {
    ansibleCoreVersion = ansibleVersionObjKeys[0].split(" [");
  } else {
    ansibleCoreVersion = ansibleVersionObjKeys[0].split(" ");
  }
  ansibleInfo["core version"] = ansibleCoreVersion[1]
    ?.slice(0, -1)
    ?.split(" ")
    ?.pop()
    ?.trim();

  ansibleInfo["location"] = (await context.ansibleConfig).ansible_location;

  if ("config file" in ansibleVersionObj) {
    ansibleInfo["config file path"] = ansibleVersionObj[
      "config file"
    ] as string;
  }

  ansibleInfo["collections location"] = (
    await context.ansibleConfig
  ).collections_paths;

  ansibleInfo["modules location"] = (
    await context.ansibleConfig
  ).module_locations;

  ansibleInfo["default host list path"] = (
    await context.ansibleConfig
  ).default_host_list;

  return ansibleInfo;
}

async function getPythonInfo() {
  const pythonInfo: ansibleMetaDataEntryType = {};

  const pythonVersionResult = await getResultsThroughCommandRunner(
    "python3",
    "--version",
  );
  if (pythonVersionResult === undefined) {
    return pythonInfo;
  }

  pythonInfo["version"] = pythonVersionResult?.stdout
    ?.trim()
    ?.split(" ")
    ?.pop()
    ?.trim();

  const pythonPathResult = await getResultsThroughCommandRunner(
    "python3",
    '-c "import sys; print(sys.executable)"',
  );
  pythonInfo["location"] = pythonPathResult?.stdout?.trim();

  return pythonInfo;
}

async function getAnsibleLintInfo() {
  const ansibleLintInfo: ansibleMetaDataEntryType = {};

  const ansibleLintVersionResult = await getResultsThroughCommandRunner(
    "ansible-lint",
    "--version",
  );

  if (ansibleLintVersionResult === undefined) {
    return ansibleLintInfo;
  }

  const ansibleLintPathResult = await getResultsThroughCommandRunner(
    "command -v",
    "ansible-lint",
  );

  // ansible-lint version reports if a newer version of the ansible-lint is available or not
  // along with the current version itself
  // so the following lines of code are to segregate the two information into to keys
  const ansibleLintVersionStdout = ansibleLintVersionResult.stdout
    .trim()
    .split("\n");
  const ansibleLintVersion = ansibleLintVersionStdout[0];
  if (ansibleLintVersionStdout.length >= 2) {
    ansibleLintInfo["upgrade status"] = ansibleLintVersionStdout[1];
  } else {
    ansibleLintInfo["upgrade status"] = "nil";
  }

  ansibleLintInfo["version"] =
    ansibleLintVersion?.split("using")[0]?.trim()?.split(" ")?.pop()?.trim() ||
    undefined;

  ansibleLintInfo["location"] =
    ansibleLintPathResult?.stdout?.trim() || undefined;

  ansibleLintInfo["config file path"] =
    context.ansibleLint.ansibleLintConfigFilePath;

  return ansibleLintInfo;
}

async function getExecutionEnvironmentInfo() {
  const eeInfo: ansibleMetaDataEntryType = {};

  const basicDetails = (await context.executionEnvironment)
    .getBasicContainerAndImageDetails;

  eeInfo["container engine"] = String(basicDetails.containerEngine);
  eeInfo["container image"] = basicDetails.containerImage;
  eeInfo["container image ID"] = basicDetails.containerImageId;

  let eeServiceWorking = false;
  let inspectResult;
  try {
    inspectResult = JSON.parse(
      child_process
        .execSync(
          `${basicDetails.containerEngine} inspect --format='{{json .Config}}' ${basicDetails.containerImage}`,
          {
            encoding: "utf-8",
          },
        )
        .toString(),
    );
    eeServiceWorking = true;
  } catch (error) {
    eeServiceWorking = false;
    console.log(error);
  }

  if (eeServiceWorking) {
    eeInfo["env"] = inspectResult["Env"];
    eeInfo["working directory"] = inspectResult["WorkingDir"];
  }

  return eeInfo;
}
