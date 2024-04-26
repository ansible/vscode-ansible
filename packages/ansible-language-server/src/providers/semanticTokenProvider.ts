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
import { IOption } from "../interfaces/module";
import { DocsLibrary } from "../services/docsLibrary";
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
];

const tokenTypesLegend = new Map(
  tokenTypes.map((value, index) => [value, index]),
);

export const tokenModifiers = [SemanticTokenModifiers.definition];

const tokenModifiersLegend = new Map(
  tokenModifiers.map((value, index) => [value, index]),
);

export async function doSemanticTokens(
  document: TextDocument,
  docsLibrary: DocsLibrary,
): Promise<SemanticTokens> {
  const builder = new SemanticTokensBuilder();
  const yDocuments = parseAllDocuments(document.getText());
  for (const yDoc of yDocuments) {
    if (yDoc.contents) {
      await markSemanticTokens([yDoc.contents], builder, document, docsLibrary);
    }
  }
  return builder.build();
}

async function markSemanticTokens(
  path: Node[],
  builder: SemanticTokensBuilder,
  document: TextDocument,
  docsLibrary: DocsLibrary,
): Promise<void> {
  const node = path[path.length - 1];
  if (isMap(node)) {
    for (const pair of node.items) {
      if (isScalar(pair.key)) {
        const keyPath = path.concat(<Scalar>(<unknown>pair), pair.key);
        if (isPlayParam(keyPath)) {
          if (playKeywords.has(String(pair.key.value)))
            markKeyword(pair.key, builder, document);
          else markOrdinaryKey(pair.key, builder, document);
        } else if (isBlockParam(keyPath)) {
          if (blockKeywords.has(String(pair.key.value)))
            markKeyword(pair.key, builder, document);
          else markOrdinaryKey(pair.key, builder, document);
        } else if (isRoleParam(keyPath)) {
          if (roleKeywords.has(String(pair.key.value)))
            markKeyword(pair.key, builder, document);
          else markOrdinaryKey(pair.key, builder, document);
        } else if (isTaskParam(keyPath)) {
          if (isTaskKeyword(String(pair.key.value))) {
            markKeyword(pair.key, builder, document);
            if (pair.key.value === "args") {
              const module = await findProvidedModule(
                path.concat(pair as unknown as Node, pair.key),
                document,
                docsLibrary,
              );
              if (module && isMap(pair.value)) {
                // highlight module parameters
                markModuleParameters(
                  pair.value,
                  module.documentation?.options,
                  builder,
                  document,
                );
              }
            }
          } else {
            const [module] = await docsLibrary.findModule(
              String(pair.key.value),
              keyPath,
              document.uri,
            );
            if (module) {
              // highlight module name
              markNode(
                pair.key,
                SemanticTokenTypes.class,
                [],
                builder,
                document,
              );
              if (isMap(pair.value)) {
                // highlight module parameters
                markModuleParameters(
                  pair.value,
                  module.documentation?.options,
                  builder,
                  document,
                );
              }
            } else {
              markAllNestedKeysAsOrdinary(
                <Scalar>(<unknown>pair),
                builder,
                document,
              );
            }
          }

          // this pair has been completely processed
          // tasks don't have any deeper structure
          continue;
        } else {
          markAllNestedKeysAsOrdinary(
            <Scalar>(<unknown>pair),
            builder,
            document,
          );
          // this pair has been completely processed
          continue;
        }
      }

      if (isNode(pair.value)) {
        await markSemanticTokens(
          path.concat(pair as unknown as Scalar, pair.value),
          builder,
          document,
          docsLibrary,
        );
      }
    }
  } else if (isSeq(node)) {
    for (const item of node.items) {
      if (isNode(item)) {
        // the builder does not support out-of-order inserts yet, hence awaiting
        // on each individual promise instead of using Promise.all
        await markSemanticTokens(
          path.concat(item),
          builder,
          document,
          docsLibrary,
        );
      }
    }
  }
}

function markModuleParameters(
  moduleParamMap: YAMLMap,
  options: Map<string, IOption> | undefined,
  builder: SemanticTokensBuilder,
  document: TextDocument,
) {
  for (const moduleParamPair of moduleParamMap.items) {
    if (isScalar(moduleParamPair.key)) {
      const option = options?.get(String(moduleParamPair.key.value));
      if (option) {
        markNode(
          moduleParamPair.key,
          SemanticTokenTypes.method,
          [],
          builder,
          document,
        );
        if (option.type === "dict" && isMap(moduleParamPair.value)) {
          // highlight sub-parameters
          markModuleParameters(
            moduleParamPair.value,
            option.suboptions,
            builder,
            document,
          );
        } else if (option.type === "list" && isSeq(moduleParamPair.value)) {
          // highlight list of sub-parameters
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
) {
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
) {
  markNode(node, SemanticTokenTypes.keyword, [], builder, document);
}

function markOrdinaryKey(
  node: Scalar,
  builder: SemanticTokensBuilder,
  document: TextDocument,
) {
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
  tokenModifiers: SemanticTokenModifiers[],
  builder: SemanticTokensBuilder,
  document: TextDocument,
) {
  const range = getOrigRange(node);
  if (range) {
    const startPosition = document.positionAt(range[0]);
    const length = range[1] - range[0];
    builder.push(
      startPosition.line,
      startPosition.character,
      length,
      encodeTokenType(tokenType),
      encodeTokenModifiers(tokenModifiers),
    );
  }
}

function encodeTokenType(tokenType: SemanticTokenTypes) {
  const tokenTypeIndex = tokenTypesLegend.get(tokenType);
  if (tokenTypeIndex === undefined) {
    throw new Error(`The '${tokenType}' token type is not in legend`);
  }
  return tokenTypeIndex;
}

function encodeTokenModifiers(
  tokenModifiers: SemanticTokenModifiers[],
): number {
  let encodedModifiers = 0;
  for (const tokenModifier of tokenModifiers) {
    const tokenModifierIndex = tokenModifiersLegend.get(tokenModifier);
    if (tokenModifierIndex === undefined) {
      throw new Error(`The '${tokenModifier}' token modifier is not in legend`);
    }
    encodedModifiers |= (1 << tokenModifierIndex) >>> 0;
  }
  return encodedModifiers;
}
