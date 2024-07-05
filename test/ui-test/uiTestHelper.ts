/* eslint-disable @typescript-eslint/no-explicit-any */
import path from "path";
import { ModalDialog, SettingsEditor } from "vscode-extension-tester";

export function getFilePath(file: string): string {
  return path.resolve(
    __dirname,
    path.join(
      "..",
      "..",
      "..",
      "..",
      "test",
      "testFixtures",
      "lightspeed",
      file,
    ),
  );
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function updateSettings(
  settingsEditor: SettingsEditor,
  setting: string,
  value: any,
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

// In the redirection occurs in the login flow, getting message from a modal dialog
// may throw NoSuchElementError. This function is for dealing with those errors.
export async function getModalDialogAndMessage(): Promise<{
  dialog: ModalDialog;
  message: string;
}> {
  for (let i = 0; i < 30; i++) {
    try {
      const dialog = new ModalDialog();
      const message = await dialog.getMessage();
      if (message !== undefined) {
        return { dialog, message };
      }
    } catch (error) {
      await sleep(1000);
    }
  }
  throw new Error("Could not retrieve a message from a modal dialog");
}

function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
