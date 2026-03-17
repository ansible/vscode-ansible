import { DefinitionLink, Range } from "vscode-languageserver";
import { Position, TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { existsSync } from "fs";
import { isScalar } from "yaml";
import { DocsLibrary } from "@src/services/docsLibrary.js";
import { toLspRange } from "@src/utils/misc.js";
import {
  AncestryBuilder,
  getOrigRange,
  getPathAt,
  isTaskParam,
  parseAllDocuments,
} from "@src/utils/yaml.js";
import {
  getSymbolAtPosition,
  getOccurrencesWithRoleContext,
  findParentTaskModuleName,
} from "@src/utils/ansibleSymbols.js";
import {
  resolveRolePath,
  resolveModuleFilePath,
} from "@src/utils/roleResolver.js";

export async function getDefinition(
  document: TextDocument,
  position: Position,
  docsLibrary: DocsLibrary,
  rolesPaths?: string[],
): Promise<DefinitionLink[] | null> {
  const yamlDocs = parseAllDocuments(document.getText());

  // First try new symbol-based definitions
  const symbolDef = getSymbolDefinition(document, position, yamlDocs, rolesPaths);
  if (symbolDef) return symbolDef;

  // Fall back to existing module definition logic
  const path = getPathAt(document, position, yamlDocs);
  if (path) {
    const node = path[path.length - 1];
    if (
      isScalar(node) &&
      new AncestryBuilder(path).parentOfKey().get() // ensure we look at a key, not value of a Pair
    ) {
      if (isTaskParam(path)) {
        const [module] = await docsLibrary.findModule(
          node.value as string,
          path,
          document.uri,
        );
        if (module) {
          const range = getOrigRange(node);
          return [
            {
              targetUri: URI.file(module.source).toString(),
              originSelectionRange: range
                ? toLspRange(range, document)
                : undefined,
              targetRange: Range.create(
                module.sourceLineRange[0],
                0,
                module.sourceLineRange[1],
                0,
              ),
              targetSelectionRange: Range.create(
                module.sourceLineRange[0],
                0,
                module.sourceLineRange[1],
                0,
              ),
            },
          ];
        }
      }
    }
  }
  return null;
}

function getSymbolDefinition(
  document: TextDocument,
  position: Position,
  yamlDocs?: import("yaml").Document[],
  rolesPaths?: string[],
): DefinitionLink[] | null {
  const symbol = getSymbolAtPosition(document, position, yamlDocs);
  if (!symbol) return null;

  switch (symbol.kind) {
    case "handler":
      return getHandlerDefinition(document, symbol.name, symbol.range);
    case "variable":
      return getVariableDefinition(document, symbol.name, symbol.range);
    case "filePath":
      return getFilePathDefinition(document, symbol.name, symbol.range);
    case "role":
      return getRoleDefinition(document, symbol.name, symbol.range, rolesPaths);
    default:
      return null;
  }
}

function getHandlerDefinition(
  document: TextDocument,
  name: string,
  originRange: Range,
): DefinitionLink[] | null {
  const definitions = getOccurrencesWithRoleContext(
    document.uri, document, name, "handler",
  ).filter((o) => o.isDefinition);

  if (definitions.length === 0) return null;

  return definitions.map((def) => ({
    targetUri: def.uri,
    originSelectionRange: originRange,
    targetRange: def.range,
    targetSelectionRange: def.range,
  }));
}

function getVariableDefinition(
  document: TextDocument,
  name: string,
  originRange: Range,
): DefinitionLink[] | null {
  const definitions = getOccurrencesWithRoleContext(
    document.uri, document, name, "variable",
  ).filter((o) => o.isDefinition);

  if (definitions.length === 0) return null;

  // Return first definition found
  const def = definitions[0];
  return [
    {
      targetUri: def.uri,
      originSelectionRange: originRange,
      targetRange: def.range,
      targetSelectionRange: def.range,
    },
  ];
}

function getFilePathDefinition(
  document: TextDocument,
  filePath: string,
  originRange: Range,
): DefinitionLink[] | null {
  // Determine the module name to resolve path correctly
  const yamlDocs = parseAllDocuments(document.getText());
  const nodePath = getPathAt(document, originRange.start, yamlDocs);
  const moduleName = nodePath ? (findParentTaskModuleName(nodePath) ?? "") : "";

  const resolvedPath = resolveModuleFilePath(
    filePath,
    moduleName,
    document.uri,
  );
  if (!resolvedPath) return null;

  const targetUri = URI.file(resolvedPath).toString();
  return [
    {
      targetUri,
      originSelectionRange: originRange,
      targetRange: Range.create(0, 0, 0, 0),
      targetSelectionRange: Range.create(0, 0, 0, 0),
    },
  ];
}

function getRoleDefinition(
  document: TextDocument,
  roleName: string,
  originRange: Range,
  rolesPaths?: string[],
): DefinitionLink[] | null {
  const rolePath = resolveRolePath(roleName, document.uri, rolesPaths);
  if (!rolePath) return null;

  const tasksMain = `${rolePath}/tasks/main.yml`;
  if (!existsSync(tasksMain)) return null;

  const targetUri = URI.file(tasksMain).toString();
  return [
    {
      targetUri,
      originSelectionRange: originRange,
      targetRange: Range.create(0, 0, 0, 0),
      targetSelectionRange: Range.create(0, 0, 0, 0),
    },
  ];
}
