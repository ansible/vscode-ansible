import { commands, window, workspace } from "vscode";
import {
  IExtensionApi,
  activatePythonExtension,
  getInterpreterDetails,
} from "./python";
import { AnsibleCommands } from "./definitions/constants";

export async function setPythonInterpreter() {
  const pythonSettings = workspace.getConfiguration("ansible.python");
  const pythonExistingInterpreterPath = await pythonSettings.get(
    "interpreterPath"
  );

  // initially identify the correct python interpreter if the interpreter path
  // is not set by the user in the extension.
  // Notify them accordingly
  if (!(await pythonExistingInterpreterPath)) {
    const pythonExtensionDetails = await getInterpreterDetails();

    if (pythonExtensionDetails.path) {
      const interpreter = pythonExtensionDetails.path;
      await window.showInformationMessage(
        `Python interpreter set: ${interpreter}. \n
        You  can change it by selecting a different interpreter anytime.`
      );

      await pythonSettings.update("interpreterPath", interpreter, false);
    }
  }
}

export async function setPythonInterpreterWithCommand() {
  // open selection pane to select the interpreter
  await commands.executeCommand("python.setInterpreter");

  // python interpreter after selection
  const pythonExtensionDetails = await getInterpreterDetails();

  // python interpreter from settings
  const ansibleSettings = workspace.getConfiguration("ansible");

  // update setting
  await ansibleSettings.update(
    "python.interpreterPath",
    pythonExtensionDetails.path,
    false
  );

  // reload window to load the selected python interpreter properly
  await commands.executeCommand("workbench.action.reloadWindow");
}
