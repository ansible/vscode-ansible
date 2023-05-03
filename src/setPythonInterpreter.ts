import { commands, window, workspace } from "vscode";
import { getInterpreterDetails } from "./python";

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
  const previousPythonExtensionDetails = await getInterpreterDetails();

  // open selection pane to select the interpreter
  await commands.executeCommand("python.setInterpreter");

  // python interpreter after selection
  const currentPythonExtensionDetails = await getInterpreterDetails();

  // python interpreter from settings
  const ansibleSettings = workspace.getConfiguration("ansible");

  if (
    previousPythonExtensionDetails.path !== currentPythonExtensionDetails.path
  ) {
    // update setting
    await ansibleSettings.update(
      "python.interpreterPath",
      currentPythonExtensionDetails.path,
      false
    );

    // reload window to load the selected python interpreter properly
    await commands.executeCommand("workbench.action.reloadWindow");
  }
}
