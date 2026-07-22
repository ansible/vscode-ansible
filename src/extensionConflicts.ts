/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved..
 *  Licensed under the MIT License. See LICENSE in the project root for details.
 *--------------------------------------------------------------------------------------------*/
import { commands, Extension, extensions, window } from "vscode";

// A set of VSCode extension ID's that conflict with our extension
const conflictingIDs = [
  "haaaad.ansible",
  "lextudio.restructuredtext", // https://github.com/vscode-restructuredtext/vscode-restructuredtext/issues/286
  "sysninja.vscode-ansible-mod",
  "tomaciazek.ansible",
  "vscoss.vscode-ansible",
  "zbr.vscode-ansible",
];

// A set of VSCode extension ID's that are currently uninstalling
const uninstallingIDs = new Set();

interface ExtensionPackageJson {
  displayName?: string;
}

function extensionDisplayName(ext: Extension<unknown>): string {
  const packageJson = ext.packageJSON as ExtensionPackageJson;
  return typeof packageJson.displayName === "string"
    ? packageJson.displayName
    : ext.id;
}

function isExtensionPresent(obj: unknown): obj is Extension<unknown> {
  return (
    obj !== undefined &&
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    typeof (obj as Extension<unknown>).id === "string" &&
    !uninstallingIDs.has((obj as Extension<unknown>).id)
  );
}

/**
 * Get all of the installed extensions that currently conflict with us
 */
export function getConflictingExtensions(): Extension<unknown>[] {
  return conflictingIDs
    .map((x) => extensions.getExtension(x))
    .filter<
      Extension<unknown>
    >((ext): ext is Extension<unknown> => isExtensionPresent(ext));
}

/**
 * Display the uninstall conflicting extension notification if there are any conflicting extensions currently installed
 */
export async function showUninstallConflictsNotification(
  conflictingExts: Extension<unknown>[],
): Promise<void> {
  // Add all available conflicting extensions to the uninstalling IDs map
  for (const ext of conflictingExts) {
    uninstallingIDs.add(ext.id);
  }

  const uninstallMsg = "Uninstall";

  if (!conflictingExts.length) {
    return;
  }
  // Gather all the conflicting display names
  let conflictMsg: string;
  if (conflictingExts.length === 1) {
    conflictMsg = `${extensionDisplayName(conflictingExts[0])} (${conflictingExts[0].id}) extension is incompatible with redhat.ansible. Please uninstall it.`;
  } else {
    const extNames: string = conflictingExts
      .map((ext) => `${extensionDisplayName(ext)} (${ext.id})`)
      .join(", ");
    conflictMsg = `The ${extNames} extensions are incompatible with redhat.ansible. Please uninstall them.`;
  }

  await window
    .showInformationMessage(conflictMsg, uninstallMsg)
    .then((clickedMsg) => {
      if (clickedMsg !== uninstallMsg) {
        return;
      }
      for (const ext of conflictingExts) {
        commands.executeCommand(
          "workbench.extensions.uninstallExtension",
          ext.id,
        );
        uninstallingIDs.delete(ext.id);
      }
    });
}
