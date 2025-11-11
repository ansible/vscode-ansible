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
  ViewControl,
  ActivityBar,
  WebviewView,
  InputBox,
  VSBrowser,
} from "vscode-extension-tester";
import { until } from "selenium-webdriver";

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

  // Wait for the setting to be available and ready
  const settingInUI = await waitForCondition({
    condition: async () => {
      try {
        const setting = await settingsEditor.findSetting(title, ...categories);
        if (setting) {
          return setting;
        }
        return false;
      } catch (error) {
        console.log(
          `Waiting for setting ${title} to be available: ${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
      }
    },
    message: `Timed out waiting for setting ${title} to be available`,
    timeout: 10000,
    pollTimeout: 500,
  });

  await settingInUI.setValue(value);
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
  const workbench = new Workbench();

  const matchingNotification = await waitForCondition({
    condition: async () => {
      const notifications = await workbench.getNotifications();
      for (const notification of notifications) {
        const message = await notification.getMessage();
        if (message === expected) {
          return notification;
        }
      }
      return false;
    },
    message: `Timed out waiting for notification with message: "${expected}"`,
    timeout: 15000,
  });

  expect(matchingNotification).not.to.be.false;

  if (clickButton) {
    const button = await VSBrowser.instance.driver.wait(
      until.elementLocated(By.xpath(".//a[@role='button']")),
      5000,
      "Timed out waiting for button to be located",
    );
    await VSBrowser.instance.driver.wait(
      until.elementIsEnabled(button as any),
      5000,
      "Timed out waiting for button to be clickable",
    );

    expect(button).not.to.be.undefined;
    await button.click();
    await sleep(500);
  } else {
    const center = await workbench.openNotificationsCenter();
    await center.clearAllNotifications();
  }
}

export async function getWebviewByLocator(locator: Locator): Promise<WebView> {
  const wv = new WebView();
  const driver = VSBrowser.instance.driver;

  const condition = async () => {
    try {
      await driver.switchTo().defaultContent();
      try {
        await driver.wait(
          until.elementLocated(By.xpath("//iframe[@class='webview ready']")),
          2000,
        );
      } catch {
        return false;
      }

      const iframes = await driver.findElements(
        By.xpath("//iframe[@class='webview ready']"),
      );

      if (iframes.length === 0) {
        return false;
      }

      for (let i = iframes.length - 1; i >= 0; i--) {
        try {
          await driver.switchTo().defaultContent();
          await driver.switchTo().frame(iframes[i]);

          const activeFrames = await driver.findElements(By.id("active-frame"));
          if (activeFrames.length === 0) {
            continue;
          }
          await driver.switchTo().frame(activeFrames[0]);

          const elements = await driver.findElements(locator);

          if (elements.length > 0) {
            return wv;
          }
        } catch (error) {
          console.log(`Error checking specific iframe: ${error}`);
          await driver.switchTo().defaultContent();
        }
      }
    } catch (outerError) {
      console.log(`Error in condition function: ${outerError}`);
    }

    return false;
  };

  const result = await waitForCondition({
    condition,
    message: `Timed out waiting for locator ${locator} in any webview`,
  });

  if (!result) {
    throw new Error(
      `waitForCondition failed to return a WebView for locator ${locator}`,
    );
  }

  return result as WebView;
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

export async function dismissNotifications(workbench: Workbench) {
  try {
    const notifications = await workbench.getNotifications();
    for (const notification of notifications) {
      try {
        await notification.dismiss();
      } catch (error) {
        console.log(
          `Failed to dismiss notification: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } catch (error) {
    console.log(
      `Failed to get notifications: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function getAnsibleViewControl(): Promise<ViewControl> {
  return await waitForCondition({
    condition: async () => {
      try {
        const activityBar = new ActivityBar();
        const ansibleView = await activityBar.getViewControl("Ansible");
        if (ansibleView) {
          return ansibleView as ViewControl;
        }
        return false;
      } catch (error) {
        console.log(
          `Waiting for Ansible view to be available: ${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
      }
    },
    message:
      "Timed out waiting for Ansible view to be available in Activity Bar",
    timeout: 20000,
    pollTimeout: 500,
  });
}

export async function connectLightspeed() {
  const explorerView = new WebviewView();
  let modalDialog: ModalDialog;
  let dialogMessage: string;
  const view = await getAnsibleViewControl();
  const sideBar = await view.openView();
  const adtView = await sideBar
    .getContent()
    .getSection("Ansible Development Tools");

  // Set "UI Test" and "One Click" options for mock server
  try {
    await fetch(`${process.env.TEST_LIGHTSPEED_URL}/__debug__/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(["--ui-test"]),
    });
  } catch (error) {
    console.error(
      "Failed to set ui-test and one-click options for lightspeed mock server",
      error,
    );
    expect.fail(
      "Failed to set ui-test and one-click options for lightspeed mock server",
    );
  }

  await adtView.collapse();

  const alfView = await sideBar
    .getContent()
    .getSection("Ansible Lightspeed Feedback");
  await alfView.collapse();

  await explorerView.switchToFrame(5000);

  const connectButton = await explorerView.findWebElement(
    By.id("lightspeed-explorer-connect"),
  );
  expect(connectButton).not.to.be.undefined;
  if (connectButton) {
    await connectButton.click();
  }
  await explorerView.switchBack();

  // Click Allow to use Lightspeed
  const { dialog } = await getModalDialogAndMessage(true);
  await dialog.pushButton("Allow");

  const { dialog: dialog2, message: message2 } =
    await getModalDialogAndMessage();
  modalDialog = dialog2;
  dialogMessage = message2;

  // If the dialog to open the external website is not suppressed, click Open
  if (dialogMessage === "Do you want Code to open the external website?") {
    await modalDialog.pushButton("Configure Trusted Domains");
    const input = await InputBox.create();
    input.confirm();

    const d = await getModalDialogAndMessage();
    modalDialog = d.dialog;
    dialogMessage = d.message;
  }

  // Click Open to allow Ansible extension to open the callback URI
  await modalDialog.pushButton("Open");
  await sleep(2000);
}

export async function waitForCondition({
  condition,
  message = `Timed out waiting for condition: ${condition.toString()}`,
  timeout = 10000,
  pollTimeout = 200,
}: {
  condition: () => Promise<any>;
  message?: string;
  timeout?: number;
  pollTimeout?: number;
}): Promise<any> {
  const driver = VSBrowser.instance.driver;
  const waitCondition = async () => {
    try {
      const result = await condition();
      return !!result;
    } catch {
      return false;
    }
  };
  await driver.wait(waitCondition, timeout, message, pollTimeout);
  return await condition();
}
