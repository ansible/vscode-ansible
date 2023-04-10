/* eslint-disable @typescript-eslint/no-explicit-any */
import path from "path";
import { SettingsEditor } from "vscode-extension-tester";

export function getFilePath(file: string): string {
  return path.resolve(
    __dirname,
    path.join("..", "..", "..", "..", "test", "testFixtures", "wisdom", file)
  );
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function updateSettings(
  settingsEditor: SettingsEditor,
  setting: string,
  value: any
) {
  let settingArray = setting.split(".");
  settingArray = settingArray.map((item) => capitalizeFirstLetter(item));

  const title = settingArray.pop();
  const categories = settingArray;

  if (!title) return;

  const settingInUI = await settingsEditor.findSetting(title, ...categories);
  await settingInUI.setValue(value);
  await sleep(1000);
}

function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
