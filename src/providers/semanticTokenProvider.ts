import {
  SemanticTokenModifiers,
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokenTypes,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Node, Pair, Scalar, YAMLMap, YAMLSeq } from 'yaml/types';
import { IOption } from '../interfaces/module';
import { DocsLibrary } from '../services/docsLibrary';
import {
  blockKeywords,
  isTaskKeyword,
  playKeywords,
  roleKeywords,
} from '../utils/ansible';
import {
  findProvidedModule,
  getOrigRange,
  isBlockParam,
  isPlayParam,
  isRoleParam,
  isTaskParam,
  parseAllDocuments,
} from '../utils/yaml';

export const tokenTypes = [
  SemanticTokenTypes.method,
  SemanticTokenTypes.class,
  SemanticTokenTypes.keyword,
  SemanticTokenTypes.property,
];

const tokenTypesLegend = new Map(
  tokenTypes.map((value, index) => [value, index])
);

export const tokenModifiers = [SemanticTokenModifiers.definition];

const tokenModifiersLegend = new Map(
  tokenModifiers.map((value, index) => [value, index])
);

export async function doSemanticTokens(
  document: TextDocument,
  docsLibrary: DocsLibrary
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
  docsLibrary: DocsLibrary
): Promise<void> {
  const node = path[path.length - 1];
  if (node instanceof YAMLMap) {
    for (const pair of node.items) {
      if (pair.key instanceof Scalar) {
        const keyPath = path.concat(pair, pair.key);
        if (isPlayParam(keyPath)) {
          if (playKeywords.has(pair.key.value))
            markKeyword(pair.key, builder, document);
          else markOrdinaryKey(pair.key, builder, document);
        } else if (isBlockParam(keyPath)) {
          if (blockKeywords.has(pair.key.value))
            markKeyword(pair.key, builder, document);
          else markOrdinaryKey(pair.key, builder, document);
        } else if (isRoleParam(keyPath)) {
          if (roleKeywords.has(pair.key.value))
            markKeyword(pair.key, builder, document);
          else markOrdinaryKey(pair.key, builder, document);
        } else if (isTaskParam(keyPath)) {
          if (isTaskKeyword(pair.key.value)) {
            markKeyword(pair.key, builder, document);
            if (pair.key.value === 'args') {
              const module = await findProvidedModule(
                path.concat(pair, pair.key),
                document,
                docsLibrary
              );
              if (module && pair.value instanceof YAMLMap) {
                // highlight module parameters
                markModuleParameters(
                  pair.value,
                  module.documentation?.options,
                  builder,
                  document
                );
              }
            }
          } else {
            const [module] = await docsLibrary.findModule(
              pair.key.value,
              keyPath,
              document.uri
            );
            if (module) {
              // highlight module name
              markNode(
                pair.key,
                SemanticTokenTypes.class,
                [],
                builder,
                document
              );
              if (pair.value instanceof YAMLMap) {
                // highlight module parameters
                markModuleParameters(
                  pair.value,
                  module.documentation?.options,
                  builder,
                  document
                );
              }
            } else {
              markAllNestedKeysAsOrdinary(pair, builder, document);
            }
          }

          // this pair has been completely processed
          // tasks don't have any deeper structure
          continue;
        } else {
          markAllNestedKeysAsOrdinary(pair, builder, document);
          // this pair has been completely processed
          continue;
        }
      }

      if (pair.value instanceof Node) {
        await markSemanticTokens(
          path.concat(pair, pair.value),
          builder,
          document,
          docsLibrary
        );
      }
    }
  } else if (node instanceof YAMLSeq) {
    for (const item of node.items) {
      if (item instanceof Node) {
        // the builder does not support out-of-order inserts yet, hence awaiting
        // on each individual promise instead of using Promise.all
        await markSemanticTokens(
          path.concat(item),
          builder,
          document,
          docsLibrary
        );
      }
    }
  }
}

function markModuleParameters(
  moduleParamMap: YAMLMap,
  options: Map<string, IOption> | undefined,
  builder: SemanticTokensBuilder,
  document: TextDocument
) {
  for (const moduleParamPair of moduleParamMap.items) {
    if (moduleParamPair.key instanceof Scalar) {
      const option = options?.get(moduleParamPair.key.value);
      if (option) {
        markNode(
          moduleParamPair.key,
          SemanticTokenTypes.method,
          [],
          builder,
          document
        );
        if (
          option.type === 'dict' &&
          moduleParamPair.value instanceof YAMLMap
        ) {
          // highlight sub-parameters
          markModuleParameters(
            moduleParamPair.value,
            option.suboptions,
            builder,
            document
          );
        } else if (
          option.type === 'list' &&
          moduleParamPair.value instanceof YAMLSeq
        ) {
          // highlight list of sub-parameters
          for (const item of moduleParamPair.value.items) {
            if (item instanceof YAMLMap) {
              markModuleParameters(item, option.suboptions, builder, document);
            } else {
              markAllNestedKeysAsOrdinary(item, builder, document);
            }
          }
        } else {
          markAllNestedKeysAsOrdinary(moduleParamPair.value, builder, document);
        }
      } else {
        markAllNestedKeysAsOrdinary(moduleParamPair.value, builder, document);
      }
    } else if (moduleParamPair.value instanceof Node) {
      markAllNestedKeysAsOrdinary(moduleParamPair.value, builder, document);
    }
  }
}

function markAllNestedKeysAsOrdinary(
  node: Node,
  builder: SemanticTokensBuilder,
  document: TextDocument
) {
  if (node instanceof Pair) {
    if (node.key instanceof Scalar) {
      markOrdinaryKey(node.key, builder, document);
    }
    if (node.value instanceof Node) {
      markAllNestedKeysAsOrdinary(node.value, builder, document);
    }
  } else if (node instanceof YAMLMap) {
    for (const pair of node.items) {
      markAllNestedKeysAsOrdinary(pair, builder, document);
    }
  } else if (node instanceof YAMLSeq) {
    for (const item of node.items) {
      if (item instanceof Node) {
        markAllNestedKeysAsOrdinary(item, builder, document);
      }
    }
  }
}

function markKeyword(
  node: Scalar,
  builder: SemanticTokensBuilder,
  document: TextDocument
) {
  markNode(node, SemanticTokenTypes.keyword, [], builder, document);
}

function markOrdinaryKey(
  node: Scalar,
  builder: SemanticTokensBuilder,
  document: TextDocument
) {
  markNode(
    node,
    SemanticTokenTypes.property,
    [SemanticTokenModifiers.definition],
    builder,
    document
  );
}

function markNode(
  node: Scalar,
  tokenType: SemanticTokenTypes,
  tokenModifiers: SemanticTokenModifiers[],
  builder: SemanticTokensBuilder,
  document: TextDocument
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
      encodeTokenModifiers(tokenModifiers)
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
  tokenModifiers: SemanticTokenModifiers[]
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
