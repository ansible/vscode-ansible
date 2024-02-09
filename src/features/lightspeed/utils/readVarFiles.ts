import * as fs from "fs";
import * as yaml from "yaml";

import { IParsedYaml } from "../../../interfaces/yaml";

function removeVarsValues(parsedYaml: IParsedYaml[] | IParsedYaml | "") {
  if (Array.isArray(parsedYaml)) {
    for (const item of parsedYaml) {
      removeVarsValues(item);
    }
  } else if (typeof parsedYaml === "object" && parsedYaml !== null) {
    for (const key in parsedYaml) {
      if (Object.prototype.hasOwnProperty.call(parsedYaml, key)) {
        parsedYaml[key] = removeVarsValues(parsedYaml[key]);
      }
    }
  } else {
    parsedYaml = "";
  }

  return parsedYaml;
}

export function readVarFiles(varFile: string): string | undefined {
  try {
    if (!fs.existsSync(varFile)) {
      return undefined;
    }
    const contents = fs.readFileSync(varFile, "utf8");
    const parsedAnsibleVars = yaml.parse(contents, {
      keepSourceTokens: true,
    });
    removeVarsValues(parsedAnsibleVars);
    const updatedFileContents = yaml.stringify(parsedAnsibleVars);
    return updatedFileContents;
  } catch (err) {
    console.error(`Failed to read ${varFile} with error ${err}`);
    return undefined;
  }
}
