import { commands, ConfigurationTarget, window, workspace } from "vscode";
import { getInterpreterDetails } from "./python";
import { isUserConfiguredPath } from "./interpreterPathResolver";

function inspectInterpreterPathConfig(): {
  hasExplicitValue: boolean;
  configTarget: ConfigurationTarget;
  currentValue: string | undefined;
} {
  const ansibleSettings = workspace.getConfiguration("ansible");
  const inspection = ansibleSettings.inspect<string>("python.interpreterPath");

  if (
    inspection?.workspaceFolderValue !== undefined &&
    inspection.workspaceFolderValue !== ""
  ) {
    return {
      hasExplicitValue: true,
      configTarget: ConfigurationTarget.WorkspaceFolder,
      currentValue: inspection.workspaceFolderValue,
    };
  }

  if (
    inspection?.workspaceValue !== undefined &&
    inspection.workspaceValue !== ""
  ) {
    return {
      hasExplicitValue: true,
      configTarget: ConfigurationTarget.Workspace,
      currentValue: inspection.workspaceValue,
    };
  }

  if (inspection?.globalValue !== undefined && inspection.globalValue !== "") {
    return {
      hasExplicitValue: true,
      configTarget: ConfigurationTarget.Global,
      currentValue: inspection.globalValue,
    };
  }

  return {
    hasExplicitValue: false,
    configTarget: ConfigurationTarget.Workspace,
    currentValue: undefined,
  };
}

export async function setPythonInterpreter() {
  const activeDocument = window.activeTextEditor?.document;
  if (activeDocument?.languageId !== "ansible") {
    return;
  }

  const configInfo = inspectInterpreterPathConfig();

  if (configInfo.hasExplicitValue) {
    console.log(
      `Ansible: Respecting existing interpreter path setting: ${configInfo.currentValue}`,
    );
    return;
  }

  const pythonExtensionDetails = await getInterpreterDetails();

  if (pythonExtensionDetails.path) {
    const interpreter = pythonExtensionDetails.path;

    const ansibleSettings = workspace.getConfiguration("ansible");
    await ansibleSettings.update(
      "python.interpreterPath",
      interpreter,
      ConfigurationTarget.Workspace, // Save to workspace level by default
    );

    window.showInformationMessage(
      `Python interpreter set: ${interpreter} at Workspace level.\n` +
        `You can change it by selecting a different interpreter anytime.`,
    );
  }
}

export async function setPythonInterpreterWithCommand() {
  const configInfo = inspectInterpreterPathConfig();
  const previousValue = configInfo.currentValue;

  // Check if current value is a user-configured relative/variable path
  const isPreservablePath = isUserConfiguredPath(previousValue);

  // Open selection pane to select the interpreter
  await commands.executeCommand("python.setInterpreter");

  // Get python interpreter after selection
  const currentPythonExtensionDetails = await getInterpreterDetails();

  if (!currentPythonExtensionDetails.path) {
    return;
  }

  const newInterpreterPath = currentPythonExtensionDetails.path;

  // If user had a relative or variable-based path, ask if they want to preserve it
  if (isPreservablePath && previousValue) {
    const choice = await window.showQuickPick(
      [
        {
          label: "Use absolute path",
          description: newInterpreterPath,
          value: newInterpreterPath,
        },
        {
          label: "Keep current relative path",
          description: previousValue,
          value: previousValue,
        },
      ],
      {
        placeHolder:
          "You have a relative/variable path configured. How would you like to save it?",
        title: "Python Interpreter Path Format",
      },
    );

    if (!choice) {
      return; // User cancelled
    }

    if (choice.value === previousValue) {
      // User wants to keep the relative path, no changes needed
      window.showInformationMessage(
        `Keeping existing interpreter path: ${previousValue}`,
      );
      return;
    }
  }

  // Update setting at the same configuration level it was previously set,
  // or Workspace level if it's a new setting
  const ansibleSettings = workspace.getConfiguration("ansible");
  await ansibleSettings.update(
    "python.interpreterPath",
    newInterpreterPath,
    configInfo.configTarget,
  );

  // Only reload if the path actually changed
  if (previousValue !== newInterpreterPath) {
    // Reload window to load the selected python interpreter properly
    await commands.executeCommand("workbench.action.reloadWindow");
  }
}
