import {
  SymbolInformation,
  SymbolKind,
  Location,
  WorkspaceSymbolParams,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { readFileSync, statSync } from "fs";
import {
  collectAllDefinitions,
  AnsibleSymbolOccurrence,
} from "@src/utils/ansibleSymbols.js";
import {
  getRoleContextFromUri,
  listRoleYamlFiles,
} from "@src/utils/roleResolver.js";

interface CacheEntry {
  version: number;
  symbols: SymbolInformation[];
}

interface FileCacheEntry {
  mtimeMs: number;
  symbols: SymbolInformation[];
}

// TODO: consider LRU cache with size limit and file-watcher-based invalidation
const documentCache = new Map<string, CacheEntry>();
const fileCache = new Map<string, FileCacheEntry>();

function occurrenceToSymbolKind(
  occ: AnsibleSymbolOccurrence,
): SymbolKind {
  if (occ.handlerSource) return SymbolKind.Function;
  if (occ.isDefinition) return SymbolKind.Variable;
  // Role references (isDefinition: false, no handlerSource)
  return SymbolKind.Package;
}

function getSymbolsForDocument(document: TextDocument): SymbolInformation[] {
  const uri = document.uri;
  const version = document.version;

  const cached = documentCache.get(uri);
  if (cached && cached.version === version) {
    return cached.symbols;
  }

  const definitions = collectAllDefinitions(document);
  const symbols = definitions.map((occ) =>
    SymbolInformation.create(
      occ.name,
      occurrenceToSymbolKind(occ),
      occ.range,
      occ.uri,
    ),
  );

  documentCache.set(uri, { version, symbols });
  return symbols;
}

function getSymbolsForFile(filePath: string, isHandlerFile = false): SymbolInformation[] {
  let mtimeMs: number;
  let content: string;
  try {
    mtimeMs = statSync(filePath).mtimeMs;

    const cached = fileCache.get(filePath);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.symbols;
    }

    content = readFileSync(filePath, { encoding: "utf8" });
  } catch {
    return [];
  }

  const fileUri = URI.file(filePath).toString();
  const doc = TextDocument.create(fileUri, "yaml", 0, content);
  const definitions = collectAllDefinitions(doc, isHandlerFile);
  const symbols = definitions.map((occ) =>
    SymbolInformation.create(
      occ.name,
      occurrenceToSymbolKind(occ),
      occ.range,
      occ.uri,
    ),
  );

  fileCache.set(filePath, { mtimeMs, symbols });
  return symbols;
}

export function getWorkspaceSymbols(
  params: WorkspaceSymbolParams,
  documents: Iterable<TextDocument>,
): SymbolInformation[] {
  const query = (params.query ?? "").toLowerCase();
  const allSymbols: SymbolInformation[] = [];
  const scannedRoles = new Set<string>();
  const seenFileUris = new Set<string>();

  for (const document of documents) {
    seenFileUris.add(document.uri);
    allSymbols.push(...getSymbolsForDocument(document));

    // If document is inside a role, also scan role files on disk
    const roleCtx = getRoleContextFromUri(document.uri);
    if (roleCtx && !scannedRoles.has(roleCtx.rolePath)) {
      scannedRoles.add(roleCtx.rolePath);

      const handlerFiles = new Set(
        listRoleYamlFiles(roleCtx.rolePath, "handlers").map((f) => f),
      );
      const roleFiles = [
        ...listRoleYamlFiles(roleCtx.rolePath, "tasks"),
        ...handlerFiles,
        `${roleCtx.rolePath}/defaults/main.yml`,
        `${roleCtx.rolePath}/vars/main.yml`,
      ];

      for (const filePath of roleFiles) {
        const fileUri = URI.file(filePath).toString();
        if (seenFileUris.has(fileUri)) continue;
        seenFileUris.add(fileUri);
        allSymbols.push(...getSymbolsForFile(filePath, handlerFiles.has(filePath)));
      }
    }
  }

  if (!query) return allSymbols;

  return allSymbols.filter((s) => s.name.toLowerCase().includes(query));
}

export function invalidateWorkspaceSymbolCache(uri: string): void {
  documentCache.delete(uri);
}
