import * as fs from "fs";
import * as yaml from "yaml";

export async function readVarFiles(
  varFile: string,
): Promise<string | undefined> {
  try {
    const contents = await fs.promises.readFile(varFile, "utf8");
    const parsedAnsibleVars = yaml.parse(contents, {
      keepSourceTokens: true,
    });
    const updatedFileContents = yaml.stringify(parsedAnsibleVars);
    return updatedFileContents;
  } catch (err) {
    console.error(`Failed to read ${varFile} with error ${err}`);
    return undefined;
  }
}
