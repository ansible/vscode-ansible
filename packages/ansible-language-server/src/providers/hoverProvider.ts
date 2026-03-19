import { Hover, MarkupContent, MarkupKind, Range } from "vscode-languageserver";
import { Position, TextDocument } from "vscode-languageserver-textdocument";
import { isScalar, Scalar } from "yaml";
import { DocsLibrary } from "@src/services/docsLibrary.js";
import {
  blockKeywords,
  isTaskKeyword,
  playKeywords,
  roleKeywords,
  taskKeywords,
} from "@src/utils/ansible.js";
import {
  formatModule,
  formatOption,
  formatTombstone,
} from "@src/utils/docsFormatter.js";
import { toLspRange } from "@src/utils/misc.js";
import {
  AncestryBuilder,
  getOrigRange,
  getPathAt,
  getPossibleOptionsForPath,
  isBlockParam,
  isPlayParam,
  isRoleParam,
  isTaskParam,
  parseAllDocuments,
} from "@src/utils/yaml.js";
import {
  getSymbolAtPosition,
  getOccurrencesWithRoleContext,
} from "@src/utils/ansibleSymbols.js";
import {
  getRoleContextFromUri,
  getRoleEntryPointDescription,
  getRoleVariables,
  resolveModuleFilePath,
  resolveRolePath,
} from "@src/utils/roleResolver.js";

export async function doHover(
  document: TextDocument,
  position: Position,
  docsLibrary: DocsLibrary,
  rolesPaths?: string[],
): Promise<Hover | null> {
  const yamlDocs = parseAllDocuments(document.getText());

  // Try symbol-based hover first
  const symbolHover = await getSymbolHover(document, position, yamlDocs, rolesPaths);
  if (symbolHover) return symbolHover;

  const path = getPathAt(document, position, yamlDocs);
  if (path) {
    const node = path[path.length - 1];
    if (
      isScalar(node) &&
      new AncestryBuilder(path).parentOfKey().get() // ensure we look at a key, not value of a Pair
    ) {
      if (isPlayParam(path)) {
        return getKeywordHover(document, node, playKeywords);
      }

      if (isBlockParam(path)) {
        return getKeywordHover(document, node, blockKeywords);
      }

      if (isRoleParam(path)) {
        return getKeywordHover(document, node, roleKeywords);
      }

      if (isTaskParam(path)) {
        if (isTaskKeyword(node.value as string)) {
          return getKeywordHover(document, node, taskKeywords);
        } else {
          const [module, hitFqcn] = await docsLibrary.findModule(
            node.value as string,
            path,
            document.uri,
          );
          const range = getOrigRange(node);
          if (module && module.documentation) {
            return {
              contents: formatModule(
                module.documentation,
                docsLibrary.getModuleRoute(hitFqcn || (node.value as string)),
              ),
              range: range ? toLspRange(range, document) : undefined,
            };
          } else if (hitFqcn) {
            // check for tombstones
            const route = docsLibrary.getModuleRoute(hitFqcn);
            if (route) {
              return {
                contents: formatTombstone(route),
                range: range ? toLspRange(range, document) : undefined,
              };
            }
          }
        }
      }

      // hovering over a module option or sub-option
      const options = await getPossibleOptionsForPath(
        path,
        document,
        docsLibrary,
      );

      if (options) {
        const option = options.get(node.value as string);
        if (option) {
          return {
            contents: formatOption(option, true),
          };
        }
      }
    }
  }
  return null;
}

function getKeywordHover(
  document: TextDocument,
  node: Scalar,
  keywords: Map<string, string | MarkupContent>,
): Hover | null {
  const keywordDocumentation = keywords.get(node.value as string);
  const markupDoc =
    typeof keywordDocumentation === "string"
      ? {
          kind: MarkupKind.Markdown,
          value: keywordDocumentation,
        }
      : keywordDocumentation;
  if (markupDoc) {
    const range = getOrigRange(node);
    return {
      contents: markupDoc,
      range: range ? toLspRange(range, document) : undefined,
    };
  } else return null;
}

async function getSymbolHover(
  document: TextDocument,
  position: Position,
  yamlDocs?: import("yaml").Document[],
  rolesPaths?: string[],
): Promise<Hover | null> {
  const symbol = getSymbolAtPosition(document, position, yamlDocs);
  if (!symbol) return null;

  switch (symbol.kind) {
    case "handler":
      return getHandlerHover(document, symbol.name, symbol.range);
    case "variable":
      return getVariableHover(document, symbol.name, symbol.range, rolesPaths);
    case "filePath":
      return getFilePathHover(document, symbol.name, symbol.range);
    case "role":
      return getRoleHover(document, symbol.name, symbol.range, rolesPaths);
    default:
      return null;
  }
}

async function getHandlerHover(
  document: TextDocument,
  name: string,
  range: Range,
): Promise<Hover | null> {
  const definitions = (await getOccurrencesWithRoleContext(
    document.uri, document, name, "handler",
  )).filter((o) => o.isDefinition);

  const defInfo = definitions.length > 0
    ? `defined at line ${definitions[0].range.start.line + 1}`
    : "definition not found";

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: `**Handler:** \`${name}\`\n\n${defInfo}`,
    },
    range,
  };
}

async function getVariableHover(
  document: TextDocument,
  name: string,
  range: Range,
  rolesPaths?: string[],
): Promise<Hover | null> {
  // Check if variable has argument_specs documentation from role
  const roleCtx = getRoleContextFromUri(document.uri, rolesPaths);
  if (roleCtx) {
    const roleVars = await getRoleVariables(roleCtx.rolePath, false);
    const roleVar = roleVars.find((v) => v.name === name);
    if (roleVar?.option) {
      return {
        contents: formatOption(roleVar.option, true),
        range,
      };
    }
  }

  // Find definition for basic info
  const definitions = (await getOccurrencesWithRoleContext(
    document.uri, document, name, "variable", rolesPaths,
  )).filter((o) => o.isDefinition);

  if (definitions.length === 0) return null;

  const def = definitions[0];
  const defLine = def.range.start.line + 1;

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: `**Variable:** \`${name}\`\n\ndefined at line ${defLine}`,
    },
    range,
  };
}

function getFilePathHover(
  document: TextDocument,
  filePath: string,
  range: Range,
): Hover | null {
  const resolvedPath = resolveModuleFilePath(filePath, "", document.uri);

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: resolvedPath
        ? `**File:** \`${resolvedPath}\``
        : `**File:** \`${filePath}\` (not found)`,
    },
    range,
  };
}

async function getRoleHover(
  document: TextDocument,
  roleName: string,
  range: Range,
  rolesPaths?: string[],
): Promise<Hover | null> {
  const rolePath = resolveRolePath(roleName, document.uri, rolesPaths);
  if (!rolePath) return null;

  const shortDesc = await getRoleEntryPointDescription(rolePath);
  const desc = shortDesc ? `\n\n${shortDesc}` : "";

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: `**Role:** \`${roleName}\`${desc}\n\n\`${rolePath}\``,
    },
    range,
  };
}
