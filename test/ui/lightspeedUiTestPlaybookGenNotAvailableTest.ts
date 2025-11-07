// BEFORE: ansible.lightspeed.enabled: true

import { expect, config } from "chai";
import { VSBrowser, Workbench, EditorView } from "vscode-extension-tester";
import {
  getFixturePath,
  sleep,
  workbenchExecuteCommand,
  dismissNotifications,
} from "./uiTestHelper";

config.truncateThreshold = 0;

describe("playbook generation features work", function () {
  let workbench: Workbench;
  let editorView: EditorView;

  before(function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
    // Initialize shared instances
    workbench = new Workbench();
    editorView = new EditorView();
  });

  beforeEach(async function () {
    // Properly await notification dismissal
    await dismissNotifications(workbench);
  });

  after(async function () {
    // Centralized cleanup
    await workbenchExecuteCommand("View: Close All Editor Groups");
  });

  it("Playbook explanation webview works (feature unavailable)", async function () {
    const folder = "lightspeed";
    const file = "playbook_explanation_feature_unavailable.yml";
    const filePath = getFixturePath(folder, file);

    // Open file in the editor
    await VSBrowser.instance.openResources(filePath);

    // Open playbook explanation webview.
    await workbenchExecuteCommand(
      "Explain the playbook with Ansible Lightspeed",
    );
    // Reduced from 2000ms: negative test to verify explanation view doesn't open
    // for invalid playbooks (missing "hosts" property)
    await sleep(1500);

    // Locate the group 1 of editor view. Since the file does not contain the "hosts" property,
    // the explanation view is not opened in the group 1. Therefore, the group 1 should be
    // undefined.
    const group = await editorView.getEditorGroup(1);
    expect(group, "Group 1 of the editor view should be undefined").to.be
      .undefined;
  });
});
