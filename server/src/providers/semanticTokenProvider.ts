import {
  SemanticTokenModifiers,
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokenTypes,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseAllDocuments } from 'yaml';
import { Node, Scalar, YAMLMap, YAMLSeq } from 'yaml/types';
import { DocsLibrary, IModuleMetadata } from '../services/docsLibrary';
import {
  blockKeywords,
  isTaskKeyword,
  playKeywords,
  roleKeywords,
} from '../utils/ansible';
import {
  findProvidedModule,
  isBlockParam,
  isPlayParam,
  isRoleParam,
  isTaskParam,
} from '../utils/yaml';

export const tokenTypes = [
  SemanticTokenTypes.method,
  SemanticTokenTypes.class,
  SemanticTokenTypes.property,
];

const tokenTypesLegend = new Map(
  tokenTypes.map((value, index) => [value, index])
);

export const tokenModifiers = [SemanticTokenModifiers.defaultLibrary];

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
        if (isPlayParam(keyPath) && playKeywords.has(pair.key.value)) {
          markKeyword(pair.key, builder, document);
        } else if (isBlockParam(keyPath) && blockKeywords.has(pair.key.value)) {
          markKeyword(pair.key, builder, document);
        } else if (isRoleParam(keyPath) && roleKeywords.has(pair.key.value)) {
          markKeyword(pair.key, builder, document);
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
                markModuleParameters(pair.value, module, builder, document);
              }
            }
          } else {
            const module = await docsLibrary.findModule(
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
                markModuleParameters(pair.value, module, builder, document);
              }
            }
          }

          // this pair has been completely processed
          // tasks don't have any deeper structure
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
  module: IModuleMetadata,
  builder: SemanticTokensBuilder,
  document: TextDocument
) {
  for (const moduleParamPair of moduleParamMap.items) {
    if (moduleParamPair.key instanceof Scalar) {
      const option = module.documentation?.options.get(
        moduleParamPair.key.value
      );
      if (option) {
        markNode(
          moduleParamPair.key,
          SemanticTokenTypes.method,
          [],
          builder,
          document
        );
      }
    }
  }
}

function markKeyword(
  node: Scalar,
  builder: SemanticTokensBuilder,
  document: TextDocument
) {
  markNode(
    node,
    SemanticTokenTypes.method,
    [SemanticTokenModifiers.defaultLibrary],
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
  if (node.range) {
    const startPosition = document.positionAt(node.range[0]);
    const length = node.range[1] - node.range[0];
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
  if (typeof tokenTypeIndex === 'undefined') {
    throw new Error(`The ${tokenType} token type is not in legend`);
  }
  return tokenTypeIndex;
}

function encodeTokenModifiers(
  tokenModifiers: SemanticTokenModifiers[]
): number {
  let encodedModifiers = 0;
  for (const tokenModifier of tokenModifiers) {
    const tokenModifierIndex = tokenModifiersLegend.get(tokenModifier);
    if (typeof tokenModifierIndex === 'undefined') {
      throw new Error(`The ${tokenModifier} token modifier is not in legend`);
    }
    encodedModifiers |= (1 << tokenModifierIndex) >>> 0;
  }
  return encodedModifiers;
}
