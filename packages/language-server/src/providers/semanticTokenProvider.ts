import {
  SemanticTokenModifiers,
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokenTypes,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  isMap,
  isNode,
  isPair,
  isScalar,
  isSeq,
  Node,
  Scalar,
  YAMLMap,
} from "yaml";
import type { PluginOption } from "@ansible/core/out/services/CollectionsService";
import { CollectionsService } from "@ansible/core/out/services/CollectionsService";
import {
  blockKeywords,
  isTaskKeyword,
  playKeywords,
  roleKeywords,
} from "../utils/ansible";
import {
  findProvidedModule,
  getOrigRange,
  isBlockParam,
  isPlayParam,
  isRoleParam,
  isTaskParam,
  parseAllDocuments,
} from "../utils/yaml";

export const tokenTypes = [
  SemanticTokenTypes.method,
  SemanticTokenTypes.class,
  SemanticTokenTypes.keyword,
  SemanticTokenTypes.property,
] as const;

const tokenTypesLegend = new Map(
  tokenTypes.map((value, index) => [value, index]),
);

export const tokenModifiers = [
  SemanticTokenModifiers.definition,
] as const;

const tokenModifiersLegend = new Map(
  tokenModifiers.map((value, index) => [value, index]),
);

export async function doSemanticTokens(
  document: TextDocument,
  collectionsService: CollectionsService,
): Promise<SemanticTokens> {
  const builder = new SemanticTokensBuilder();
  const yDocuments = parseAllDocuments(document.getText());
  for (const yDoc of yDocuments) {
    if (yDoc.contents) {
      await markSemanticTokens(
        [yDoc.contents],
        builder,
        document,
        collectionsService,
      );
    }
  }
  return builder.build();
}

async function markSemanticTokens(
  path: Node[],
  builder: SemanticTokensBuilder,
  document: TextDocument,
  collectionsService: CollectionsService,
): Promise<void> {
  const node = path[path.length - 1];

  if (isMap(node)) {
    for (const pair of node.items) {
      if (isScalar(pair.key)) {
        const keyPath = path.concat(pair as unknown as Scalar, pair.key);

        if (isPlayParam(keyPath)) {
          if (playKeywords.has(String(pair.key.value))) {
            markKeyword(pair.key, builder, document);
          } else {
            markOrdinaryKey(pair.key, builder, document);
          }
        } else if (isBlockParam(keyPath)) {
          if (blockKeywords.has(String(pair.key.value))) {
            markKeyword(pair.key, builder, document);
          } else {
            markOrdinaryKey(pair.key, builder, document);
          }
        } else if (isRoleParam(keyPath)) {
          if (roleKeywords.has(String(pair.key.value))) {
            markKeyword(pair.key, builder, document);
          } else {
            markOrdinaryKey(pair.key, builder, document);
          }
        } else if (isTaskParam(keyPath)) {
          if (isTaskKeyword(String(pair.key.value))) {
            markKeyword(pair.key, builder, document);

            if (pair.key.value === "args") {
              const module = await findProvidedModule(
                path.concat(pair as unknown as Node, pair.key),
                document,
                collectionsService,
              );
              if (module?.doc?.options && isMap(pair.value)) {
                markModuleParameters(
                  pair.value,
                  module.doc.options,
                  builder,
                  document,
                );
              }
            }
          } else {
            const fqcn = resolveFqcn(String(pair.key.value));
            const pluginData =
              await collectionsService.getPluginDocumentation(fqcn, "module");

            if (pluginData) {
              markNode(
                pair.key,
                SemanticTokenTypes.class,
                [],
                builder,
                document,
              );
              if (pluginData.doc?.options && isMap(pair.value)) {
                markModuleParameters(
                  pair.value,
                  pluginData.doc.options,
                  builder,
                  document,
                );
              }
            } else {
              markAllNestedKeysAsOrdinary(
                pair as unknown as Scalar,
                builder,
                document,
              );
            }
          }
          continue;
        } else {
          markAllNestedKeysAsOrdinary(
            pair as unknown as Scalar,
            builder,
            document,
          );
          continue;
        }
      }

      if (isNode(pair.value)) {
        await markSemanticTokens(
          path.concat(pair as unknown as Scalar, pair.value),
          builder,
          document,
          collectionsService,
        );
      }
    }
  } else if (isSeq(node)) {
    for (const item of node.items) {
      if (isNode(item)) {
        await markSemanticTokens(
          path.concat(item),
          builder,
          document,
          collectionsService,
        );
      }
    }
  }
}

function resolveFqcn(name: string): string {
  const dotCount = (name.match(/\./g) || []).length;
  return dotCount >= 2 ? name : `ansible.builtin.${name}`;
}

function markModuleParameters(
  moduleParamMap: YAMLMap,
  options: Record<string, PluginOption>,
  builder: SemanticTokensBuilder,
  document: TextDocument,
): void {
  for (const moduleParamPair of moduleParamMap.items) {
    if (isScalar(moduleParamPair.key)) {
      const option = options[String(moduleParamPair.key.value)];
      if (option) {
        markNode(
          moduleParamPair.key,
          SemanticTokenTypes.method,
          [],
          builder,
          document,
        );
        if (option.type === "dict" && option.suboptions && isMap(moduleParamPair.value)) {
          markModuleParameters(
            moduleParamPair.value,
            option.suboptions,
            builder,
            document,
          );
        } else if (
          option.type === "list" &&
          option.suboptions &&
          isSeq(moduleParamPair.value)
        ) {
          for (const item of moduleParamPair.value.items) {
            if (isMap(item)) {
              markModuleParameters(item, option.suboptions, builder, document);
            } else {
              markAllNestedKeysAsOrdinary(item as Node, builder, document);
            }
          }
        } else {
          markAllNestedKeysAsOrdinary(
            moduleParamPair.value as Node,
            builder,
            document,
          );
        }
      } else {
        markAllNestedKeysAsOrdinary(
          moduleParamPair.value as Node,
          builder,
          document,
        );
      }
    } else if (isNode(moduleParamPair.value)) {
      markAllNestedKeysAsOrdinary(moduleParamPair.value, builder, document);
    }
  }
}

function markAllNestedKeysAsOrdinary(
  node: Node,
  builder: SemanticTokensBuilder,
  document: TextDocument,
): void {
  if (isPair(node)) {
    if (isScalar(node.key)) {
      markOrdinaryKey(node.key, builder, document);
    }
    if (isNode(node.value)) {
      markAllNestedKeysAsOrdinary(node.value, builder, document);
    }
  } else if (isMap(node)) {
    for (const pair of node.items) {
      markAllNestedKeysAsOrdinary(pair as unknown as Scalar, builder, document);
    }
  } else if (isSeq(node)) {
    for (const item of node.items) {
      if (isNode(item)) {
        markAllNestedKeysAsOrdinary(item, builder, document);
      }
    }
  }
}

function markKeyword(
  node: Scalar,
  builder: SemanticTokensBuilder,
  document: TextDocument,
): void {
  markNode(node, SemanticTokenTypes.keyword, [], builder, document);
}

function markOrdinaryKey(
  node: Scalar,
  builder: SemanticTokensBuilder,
  document: TextDocument,
): void {
  markNode(
    node,
    SemanticTokenTypes.property,
    [SemanticTokenModifiers.definition],
    builder,
    document,
  );
}

function markNode(
  node: Scalar,
  tokenType: SemanticTokenTypes,
  modifiers: SemanticTokenModifiers[],
  builder: SemanticTokensBuilder,
  document: TextDocument,
): void {
  const range = getOrigRange(node);
  if (range) {
    const startPosition = document.positionAt(range[0]);
    const length = range[1] - range[0];
    builder.push(
      startPosition.line,
      startPosition.character,
      length,
      encodeTokenType(tokenType),
      encodeTokenModifiers(modifiers),
    );
  }
}

function encodeTokenType(tokenType: SemanticTokenTypes): number {
  const index = tokenTypesLegend.get(tokenType as typeof tokenTypes[number]);
  if (index === undefined) {
    throw new Error(`The '${tokenType}' token type is not in legend`);
  }
  return index;
}

function encodeTokenModifiers(modifiers: SemanticTokenModifiers[]): number {
  let encoded = 0;
  for (const modifier of modifiers) {
    const index = tokenModifiersLegend.get(
      modifier as typeof tokenModifiers[number],
    );
    if (index === undefined) {
      throw new Error(`The '${modifier}' token modifier is not in legend`);
    }
    encoded |= (1 << index) >>> 0;
  }
  return encoded;
}
