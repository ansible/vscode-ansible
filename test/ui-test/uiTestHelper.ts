/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from "chai";
import path from "path";
import {
  By,
  ModalDialog,
  SettingsEditor,
  Workbench,
} from "vscode-extension-tester";

// Returns testFixtures/ path by default, and can
// return testFixtures/ subfolders and files.
export function getFixturePath(subdir: string = "", file: string = ""): string {
  return path.resolve(
    __dirname,
    path.join("..", "..", "..", "..", "test", "testFixtures", subdir, file),
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
export async function getModalDialogAndMessage(details = false): Promise<{
  dialog: ModalDialog;
  message: string;
}> {
  for (let i = 0; i < 30; i++) {
    try {
      const dialog = await new ModalDialog().wait();
      const message = details
        ? await dialog.getDetails()
        : await dialog.getMessage();
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

export async function expectNotification(
  expected: string,
  clickButton = false,
): Promise<void> {
  const notifications = await new Workbench().getNotifications();
  expect(notifications.length).greaterThan(0);
  expect(await notifications[0].getMessage()).equals(expected);
  if (clickButton) {
    const button = await notifications[0].findElement(
      By.xpath(".//a[@role='button']"),
    );
    expect(button).not.to.be.undefined;
    await button.click();
    await sleep(500);
  } else {
    for (const notification of notifications) {
      notification.dismiss();
    }
  }
}
