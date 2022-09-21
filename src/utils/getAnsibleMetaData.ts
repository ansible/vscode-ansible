import { Connection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { WorkspaceFolderContext } from "../services/workspaceManager";
import { CommandRunner } from "./commandRunner";
import * as child_process from "child_process";

let context: WorkspaceFolderContext;
let connection: Connection;

export async function getAnsibleMetaData(
  contextLocal: WorkspaceFolderContext,
  connectionLocal: Connection,
) {
  context = contextLocal;
  connection = connectionLocal;

  const ansibleMetaData = {};

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
    console.log(
      `cmd '${cmd} ${arg}' was not executed with the following error: ' ${error.toString()}`,
    );
    return undefined;
  }

  return result;
}

async function getAnsibleInfo() {
  const ansibleInfo = {};

  const ansibleVersionObj = (await context.ansibleConfig).ansible_meta_data;
  const ansibleVersionObjKeys = Object.keys(ansibleVersionObj);

  // return empty if ansible --version fails to execute
  if (ansibleVersionObjKeys.length === 0) {
    return ansibleInfo;
  }

  let ansibleVersion;
  if (ansibleVersionObjKeys[0].includes(" [")) {
    ansibleVersion = ansibleVersionObjKeys[0].split(" [");
  } else {
    ansibleVersion = ansibleVersionObjKeys[0].split(" ");
  }
  ansibleInfo["ansible version"] = `Ansible ${ansibleVersion[1].slice(0, -1)}`;

  ansibleInfo["ansible location"] = (
    await context.ansibleConfig
  ).ansible_location;

  ansibleInfo["config file path"] = [ansibleVersionObj["config file"]];

  ansibleInfo["ansible collections location"] = (
    await context.ansibleConfig
  ).collections_paths;

  ansibleInfo["ansible module location"] = (
    await context.ansibleConfig
  ).module_locations;

  ansibleInfo["ansible default host list path"] = (
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

  pythonInfo["python version"] = pythonVersionResult.stdout.trim();

  const pythonPathResult = await getResultsThroughCommandRunner(
    "python",
    '-c "import sys; print(sys.executable)"',
  );
  pythonInfo["python location"] = pythonPathResult.stdout.trim();

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
    "which",
    "ansible-lint",
  );

  ansibleLintInfo["ansible-lint version"] =
    ansibleLintVersionResult.stdout.trim();

  ansibleLintInfo["ansible-lint location"] =
    ansibleLintPathResult.stdout.trim();

  return ansibleLintInfo;
}

async function getExecutionEnvironmentInfo() {
  const eeInfo = {};

  const basicDetails = (await context.executionEnvironment)
    .getBasicContainerAndImageDetails;

  eeInfo["container engine"] = basicDetails.containerEngine;
  eeInfo["container image"] = basicDetails.containerImage;
  eeInfo["container image ID"] = basicDetails.containerImageId;
  eeInfo["container volume mounts"] = basicDetails.containerVolumeMounts;

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
