import { Connection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { WorkspaceFolderContext } from "../services/workspaceManager";
import { CommandRunner } from "./commandRunner";
import * as child_process from "child_process";

let context: WorkspaceFolderContext;
let connection: Connection;

type AnsibleMetaData = {
  "ansible information": AnsibleInfo;
};

type AnsibleInfo = {
  x: string;
};

export async function getAnsibleMetaData(
  contextLocal: WorkspaceFolderContext,
  connectionLocal: Connection,
) {
  context = contextLocal;
  connection = connectionLocal;

  const ansibleMetaData = {} as AnsibleMetaData;

  ansibleMetaData["ansible information"] = await getAnsibleInfo();
  ansibleMetaData["python information"] = await getPythonInfo();
  ansibleMetaData["ansible-lint information"] = await getAnsibleLintInfo();

  const settings = await context.documentSettings.get(
    context.workspaceFolder.uri,
  );

  if (settings.executionEnvironment.enabled) {
    ansibleMetaData["execution environment information"] =
      await getExecutionEnvironmentInfo();
  }

  return ansibleMetaData;
}

export async function getResultsThroughCommandRunner(cmd, arg) {
  const settings = await context.documentSettings.get(
    context.workspaceFolder.uri,
  );
  const commandRunner = new CommandRunner(connection, context, settings);
  const workingDirectory = URI.parse(context.workspaceFolder.uri).path;
  const mountPaths = new Set([workingDirectory]);

  try {
    const result = await commandRunner.runCommand(
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
    const msg = error instanceof Error ? error.message : (error as string);
    console.log(
      `cmd '${cmd} ${arg}' was not executed with the following error: ' ${msg}`,
    );
    return undefined;
  }

  return undefined;
}

async function getAnsibleInfo() {
  const ansibleInfo = {} as AnsibleInfo;

  const ansibleVersionObj = (await context.ansibleConfig).ansible_meta_data;
  const ansibleVersionObjKeys = Object.keys(ansibleVersionObj);

  // return empty if ansible --version fails to execute
  if (ansibleVersionObjKeys.length === 0) {
    return ansibleInfo;
  }

  let ansibleCoreVersion: string[];
  if (ansibleVersionObjKeys[0].includes(" [")) {
    ansibleCoreVersion = ansibleVersionObjKeys[0].split(" [");
  } else {
    ansibleCoreVersion = ansibleVersionObjKeys[0].split(" ");
  }
  ansibleInfo["core version"] = ansibleCoreVersion[1]
    .slice(0, -1)
    .split(" ")
    .pop()
    .trim();

  ansibleInfo["location"] = (await context.ansibleConfig).ansible_location;

  ansibleInfo["config file path"] = ansibleVersionObj["config file"];

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
  const pythonInfo = {};

  const pythonVersionResult = await getResultsThroughCommandRunner(
    "python3",
    "--version",
  );
  if (pythonVersionResult === undefined) {
    return pythonInfo;
  }

  pythonInfo["version"] = pythonVersionResult.stdout
    .trim()
    .split(" ")
    .pop()
    .trim();

  const pythonPathResult = await getResultsThroughCommandRunner(
    "python3",
    '-c "import sys; print(sys.executable)"',
  );
  pythonInfo["location"] = pythonPathResult.stdout.trim();

  return pythonInfo;
}

async function getAnsibleLintInfo() {
  const ansibleLintInfo = {};

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
  const ansibleLintVersionArray = ansibleLintVersionResult.stdout
    .trim()
    .split("\n");
  const ansibleLintVersion = ansibleLintVersionArray[0];
  const ansibleLintUpgradeStatus = ansibleLintVersionArray[1]
    ? ansibleLintVersionArray[1]
    : undefined;

  ansibleLintInfo["version"] = ansibleLintVersion
    .split("using")[0]
    .trim()
    .split(" ")
    .pop()
    .trim();
  ansibleLintInfo["upgrade status"] = ansibleLintUpgradeStatus;

  ansibleLintInfo["location"] = ansibleLintPathResult.stdout.trim();

  ansibleLintInfo["config file path"] =
    context.ansibleLint.ansibleLintConfigFilePath;

  return ansibleLintInfo;
}

async function getExecutionEnvironmentInfo() {
  const eeInfo = {};

  const basicDetails = (await context.executionEnvironment)
    .getBasicContainerAndImageDetails;

  eeInfo["container engine"] = basicDetails.containerEngine;
  eeInfo["container image"] = basicDetails.containerImage;
  eeInfo["container image ID"] = basicDetails.containerImageId;

  let eeServiceWorking = false;
  let inspectResult: unknown;
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
