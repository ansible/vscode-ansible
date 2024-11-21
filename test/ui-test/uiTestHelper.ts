/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from "chai";
import path from "path";
import {
  By,
  Locator,
  ModalDialog,
  SettingsEditor,
  Workbench,
  WebView,
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
    } catch {
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

export async function getWebviewByLocator(locator: Locator): Promise<WebView> {
  const wv = await new WebView();
  const driver = wv.getDriver();

  driver.switchTo().defaultContent();

  const iframes = await wv.findElements(
    By.xpath("//iframe[@class='webview ready']"),
  );

  for (let i = iframes.length - 1; i >= 0; i--) {
    await driver.switchTo().defaultContent();
    await driver.switchTo().frame(iframes[i]);

    const iframeName = await driver.executeScript("return self.name");

    const activeFrame = await driver.findElement(By.id("active-frame"));
    await driver.switchTo().frame(activeFrame);

    const elements = await driver.findElements(locator);
    // console.log(`Switched to active-frame of iframe ${iframeName}`);
    // console.log(elements);
    if (elements.length === 0) {
      console.log(`locator=${locator} not found :-(`);
      continue;
    }
    console.log(`locator=${locator} found in iframe ${iframeName}!`);

    return wv;
  }
  // debugger;
  throw new Error("Cannot find any matching view");
}

export async function workbenchExecuteCommand(command: string) {
  const workbench = new Workbench();
  workbench.getDriver().switchTo().defaultContent();
  for (let i = 0; i < 5; i++) {
    try {
      return await workbench.executeCommand(command);
    } catch (e) {
      console.log(`workbenchExecuteCommand: i=${i} exception ${e}`);
      if (i > 3) {
        throw e;
      }
    }
  }
}

export async function openSettings() {
  const workbench = new Workbench();

  for (let i = 0; i < 5; i++) {
    try {
      return await workbench.openSettings();
    } catch (e) {
      console.log(`openSettings: i=${i} exception ${e}`);
      if (i > 3) {
        throw e;
      }
    }
  }

  throw new Error("Something bad happened");
}
