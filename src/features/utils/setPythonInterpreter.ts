import { commands, window, workspace } from "vscode";
import { getInterpreterDetails } from "./python";

export async function setPythonInterpreter() {
  // set interpreter only when a doc with ansible language id is found
  const activeDocument = window.activeTextEditor?.document;
  if (activeDocument?.languageId !== "ansible") {
    return;
  }

  const ansibleSettings = workspace.getConfiguration("ansible");
  const pythonExistingInterpreterPath = await ansibleSettings.get(
    "python.interpreterPath",
  );

  // initially identify the correct python interpreter if the interpreter path
  // is not set by the user in the extension.
  // Notify them accordingly
  if (!(await pythonExistingInterpreterPath)) {
    const pythonExtensionDetails = await getInterpreterDetails();

    if (pythonExtensionDetails.path) {
      const interpreter = pythonExtensionDetails.path;

      await ansibleSettings.update(
        "python.interpreterPath",
        interpreter,
        false,
      );

      window.showInformationMessage(
        `Python interpreter set: ${interpreter} at User level \n
        You  can change it by selecting a different interpreter anytime.`,
      );
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

  // update setting
  await ansibleSettings.update(
    "python.interpreterPath",
    currentPythonExtensionDetails.path,
    false,
  );

  if (
    previousPythonExtensionDetails.path !== currentPythonExtensionDetails.path
  ) {
    // reload window to load the selected python interpreter properly
    await commands.executeCommand("workbench.action.reloadWindow");
  }
}
