import { IntervalTree } from "@flatten-js/interval-tree";
import {
  Connection,
  Diagnostic,
  integer,
  TextDocumentContentChangeEvent,
  TextDocuments,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

/**
 * Caches diagnostics and tracks their origins so that reported items
 * can be cleared when all originating files are closed.
 */
export class ValidationManager {
  private connection: Connection;
  private documents: TextDocuments<TextDocument>;

  private validationCache: Map<string, IntervalTree<Diagnostic>> = new Map();
  private referencedFilesByOrigin: Map<string, Set<string>> = new Map();
  private referencedFileRefCounter: Map<string, number> = new Map();

  constructor(connection: Connection, documents: TextDocuments<TextDocument>) {
    this.connection = connection;
    this.documents = documents;
  }

  public processDiagnostics(
    originFileUri: string,
    diagnosticsByFile: Map<string, Diagnostic[]>,
  ): void {
    if (!this.documents.get(originFileUri)) {
      return;
    }

    let referencedFiles = this.referencedFilesByOrigin.get(originFileUri);
    if (!referencedFiles) {
      referencedFiles = new Set<string>();
      this.referencedFilesByOrigin.set(originFileUri, referencedFiles);
    }

    const unreferencedFiles = [...referencedFiles].filter(
      (f) => !diagnosticsByFile.has(f),
    );

    for (const fileUri of unreferencedFiles) {
      referencedFiles.delete(fileUri);
      this.handleFileUnreferenced(fileUri);
    }

    for (const [fileUri] of diagnosticsByFile) {
      if (!referencedFiles.has(fileUri)) {
        referencedFiles.add(fileUri);
        this.handleFileReferenced(fileUri);
      }
    }

    for (const [fileUri, fileDiagnostics] of diagnosticsByFile) {
      this.connection.sendDiagnostics({
        uri: fileUri,
        diagnostics: fileDiagnostics,
      });
    }
  }

  public cacheDiagnostics(
    originFileUri: string,
    cacheableDiagnostics: Map<string, Diagnostic[]>,
  ): void {
    if (!this.documents.get(originFileUri)) {
      return;
    }
    for (const [fileUri, fileDiagnostics] of cacheableDiagnostics) {
      const diagnosticTree = new IntervalTree<Diagnostic>();
      this.validationCache.set(fileUri, diagnosticTree);

      for (const diagnostic of fileDiagnostics) {
        diagnosticTree.insert(
          [diagnostic.range.start.line, diagnostic.range.end.line],
          diagnostic,
        );
      }
    }
  }

  public reconcileCacheItems(
    fileUri: string,
    changes: TextDocumentContentChangeEvent[],
  ): void {
    const diagnosticTree = this.validationCache.get(fileUri);
    if (!diagnosticTree) return;

    for (const change of changes) {
      if (!("range" in change)) continue;

      const invalidated = diagnosticTree.search([
        change.range.start.line,
        change.range.end.line,
      ]);
      if (invalidated) {
        for (const diagnostic of invalidated) {
          diagnosticTree.remove(
            [diagnostic.range.start.line, diagnostic.range.end.line],
            diagnostic,
          );
        }
      }

      let displacement = 0;
      displacement -= change.range.end.line - change.range.start.line;
      displacement += change.text.match(/\n|\r\n|\r/g)?.length || 0;

      if (displacement) {
        const displaced = diagnosticTree.search([
          change.range.start.line,
          integer.MAX_VALUE,
        ]);
        if (displaced) {
          for (const diagnostic of displaced) {
            diagnosticTree.remove(
              [diagnostic.range.start.line, diagnostic.range.end.line],
              diagnostic,
            );
            diagnostic.range.start.line += displacement;
            diagnostic.range.end.line += displacement;
            diagnosticTree.insert(
              [diagnostic.range.start.line, diagnostic.range.end.line],
              diagnostic,
            );
          }
        }
      }
    }
  }

  public getValidationFromCache(
    fileUri: string,
  ): Map<string, Diagnostic[]> | undefined {
    const referencedFiles = this.referencedFilesByOrigin.get(fileUri);
    if (referencedFiles) {
      const diagnosticsByFile: Map<string, Diagnostic[]> = new Map();
      for (const referencedFileUri of referencedFiles) {
        const diagnostics = this.validationCache.get(referencedFileUri);
        if (diagnostics) {
          diagnosticsByFile.set(referencedFileUri, diagnostics.values);
        }
      }
      return diagnosticsByFile;
    }

    const diagnostics = this.validationCache.get(fileUri);
    if (diagnostics) {
      return new Map([[fileUri, diagnostics.values]]);
    }
  }

  public handleDocumentClosed(fileUri: string): void {
    const referencedFiles = this.referencedFilesByOrigin.get(fileUri);
    if (referencedFiles) {
      referencedFiles.forEach((f) => this.handleFileUnreferenced(f));
      this.referencedFilesByOrigin.delete(fileUri);
    }
  }

  private handleFileReferenced(fileUri: string): void {
    this.referencedFileRefCounter.set(fileUri, this.getRefCounter(fileUri) + 1);
  }

  private handleFileUnreferenced(fileUri: string): void {
    const counter = this.getRefCounter(fileUri) - 1;
    if (counter <= 0) {
      this.validationCache.delete(fileUri);
      this.connection.sendDiagnostics({ uri: fileUri, diagnostics: [] });
      this.referencedFileRefCounter.delete(fileUri);
    } else {
      this.referencedFileRefCounter.set(fileUri, counter);
    }
  }

  private getRefCounter(fileUri: string): number {
    return this.referencedFileRefCounter.get(fileUri) ?? 0;
  }
}
