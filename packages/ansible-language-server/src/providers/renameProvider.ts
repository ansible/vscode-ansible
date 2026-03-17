import {
  Position,
  Range,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  getSymbolAtPosition,
  getOccurrencesWithRoleContext,
  AnsibleSymbolOccurrence,
} from "@src/utils/ansibleSymbols.js";

export function prepareRename(
  document: TextDocument,
  position: Position,
): Range | null {
  const symbol = getSymbolAtPosition(document, position);
  if (!symbol) return null;

  // Only handlers and variables support rename
  if (symbol.kind !== "handler" && symbol.kind !== "variable") {
    return null;
  }

  return symbol.range;
}

export function doRename(
  document: TextDocument,
  position: Position,
  newName: string,
  rolesPaths?: string[],
): WorkspaceEdit | null {
  const symbol = getSymbolAtPosition(document, position);
  if (!symbol) return null;

  if (symbol.kind !== "handler" && symbol.kind !== "variable") {
    return null;
  }

  let allOccurrences: AnsibleSymbolOccurrence[] = getOccurrencesWithRoleContext(
    document.uri, document, symbol.name, symbol.kind, rolesPaths,
  );

  // Apply handler rename matrix
  if (symbol.kind === "handler" && symbol.handlerSource) {
    allOccurrences = applyHandlerRenameMatrix(
      allOccurrences,
      symbol.handlerSource,
    );
  }

  if (allOccurrences.length === 0) return null;

  // Group edits by URI
  const changes: { [uri: string]: TextEdit[] } = {};
  for (const occ of allOccurrences) {
    if (!changes[occ.uri]) {
      changes[occ.uri] = [];
    }
    changes[occ.uri].push(TextEdit.replace(occ.range, newName));
  }

  return { changes };
}

/**
 * Apply handler rename matrix:
 * - notify → updates notify + name + listen
 *   (if handler has name == listen → only update listen, not name)
 * - name → updates name + notify
 * - listen → updates listen + notify
 */
function applyHandlerRenameMatrix(
  occurrences: AnsibleSymbolOccurrence[],
  source: "name" | "notify" | "listen",
): AnsibleSymbolOccurrence[] {
  if (source === "name") {
    return occurrences.filter(
      (o) => o.handlerSource === "name" || o.handlerSource === "notify",
    );
  }

  if (source === "listen") {
    return occurrences.filter(
      (o) => o.handlerSource === "listen" || o.handlerSource === "notify",
    );
  }

  // source === "notify": update all, but handle name==listen case
  // Group handler definitions by their containing handler (by URI + line proximity)
  const nameOccurrences = occurrences.filter(
    (o) => o.handlerSource === "name",
  );
  const listenOccurrences = occurrences.filter(
    (o) => o.handlerSource === "listen",
  );

  // Find handlers where name and listen co-exist in the same handler block.
  // When both are present, renaming from notify should update listen but not name
  // (to avoid double-renaming the same logical handler).
  // We detect co-location by comparing handlerMapOffset (YAML map start offset).
  const excludeNameUris = new Set<string>();
  for (const nameOcc of nameOccurrences) {
    for (const listenOcc of listenOccurrences) {
      if (
        nameOcc.uri === listenOcc.uri &&
        nameOcc.handlerMapOffset !== undefined &&
        nameOcc.handlerMapOffset === listenOcc.handlerMapOffset
      ) {
        excludeNameUris.add(
          `${nameOcc.uri}:${nameOcc.range.start.line}`,
        );
      }
    }
  }

  return occurrences.filter((o) => {
    if (o.handlerSource === "name") {
      return !excludeNameUris.has(
        `${o.uri}:${o.range.start.line}`,
      );
    }
    return true;
  });
}
