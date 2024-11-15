/* eslint-disable  @typescript-eslint/no-explicit-any */

import { getBinDetail } from "../contentCreator/utils";
import * as ini from "ini";

export async function getSystemDetails() {
  const systemInfo: any = {};

  // get ansible version and path
  const ansibleVersion = await getBinDetail("ansible", "--version");
  if (ansibleVersion !== "failed") {
    const versionInfo = ini.parse(ansibleVersion.toString());

    const versionInfoObjKeys = Object.keys(versionInfo);

    // return empty if ansible --version fails to execute
    if (versionInfoObjKeys.length === 0) {
      console.debug("[ansible-creator] No version information from ansible");
    }

    const ansibleCoreVersion = versionInfoObjKeys[0].includes(" [")
      ? versionInfoObjKeys[0].split(" [")
      : versionInfoObjKeys[0].split(" ");

    systemInfo["ansible version"] = ansibleCoreVersion[1]
      .slice(0, -1)
      .split(" ")
      .pop()
      ?.trim();

    systemInfo["ansible location"] = versionInfo["executable location"];
  }

  // get python version
  const pythonVersion = await getBinDetail("python3", "--version");
  if (pythonVersion !== "failed") {
    systemInfo["python version"] = pythonVersion
      .toString()
      .trim()
      .split(" ")
      .pop()
      ?.trim();
  }

  // get python path
  const pythonPathResult = await getBinDetail(
    "python3",
    '-c "import sys; print(sys.executable)"',
  );
  if (pythonPathResult !== "failed") {
    systemInfo["python location"] = pythonPathResult.toString().trim();
  }

  // get ansible-creator version
  const ansibleCreatorVersion = await getBinDetail(
    "ansible-creator",
    "--version",
  );
  if (ansibleCreatorVersion !== "failed") {
    systemInfo["ansible-creator version"] = ansibleCreatorVersion
      .toString()
      .trim();
  }

  // get ansible-creator version
  const ansibleDevEnvironmentVersion = await getBinDetail("ade", "--version");
  if (ansibleDevEnvironmentVersion !== "failed") {
    systemInfo["ansible-dev-environment version"] = ansibleDevEnvironmentVersion
      .toString()
      .trim();
  }
  return systemInfo;
}
