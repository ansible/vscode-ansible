import * as fs from "fs";
import * as yaml from "yaml";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compareObjects(baseObject: any, newObject: any): boolean {
  // compare the number of keys
  const baseObjectKeys = Object.keys(baseObject);
  const newObjectKeys = Object.keys(newObject);

  if (baseObjectKeys.length !== newObjectKeys.length) {
    return false;
  }

  // compare the values for each key
  for (const key of baseObjectKeys) {
    if (baseObject[key] !== newObject[key]) {
      return false;
    }
  }

  // all keys and values are equal
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseYamlFile(filePath: string): any {
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    return undefined;
  }
  try {
    const fileContents = fs.readFileSync(filePath, "utf8");
    const parsedAnsibleDocument = yaml.parse(fileContents, {
      keepSourceTokens: true,
    });
    return parsedAnsibleDocument;
  } catch (error) {
    console.error(`Error parsing YAML file ${filePath}: ${error}`);
    return undefined;
  }
}
