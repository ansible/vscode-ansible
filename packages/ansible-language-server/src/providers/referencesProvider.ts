import { Location, Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  getSymbolAtPosition,
  getOccurrencesWithRoleContext,
} from "@src/utils/ansibleSymbols.js";

export async function getReferences(
  document: TextDocument,
  position: Position,
  includeDeclaration: boolean,
  rolesPaths?: string[],
): Promise<Location[] | null> {
  const symbol = getSymbolAtPosition(document, position);
  if (!symbol) return null;

  let allOccurrences = await getOccurrencesWithRoleContext(
    document.uri, document, symbol.name, symbol.kind, rolesPaths,
  );

  if (!includeDeclaration) {
    allOccurrences = allOccurrences.filter((o) => !o.isDefinition);
  }

  if (allOccurrences.length === 0) return null;

  return allOccurrences.map((o) =>
    Location.create(o.uri, o.range),
  );
}
