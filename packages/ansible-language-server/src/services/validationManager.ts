import IntervalTree from "@flatten-js/interval-tree";
import {
  Connection,
  Diagnostic,
  integer,
  TextDocumentContentChangeEvent,
  TextDocuments,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

/**
 * Provides cache for selected diagnostics.
 *
 * Keeps track of origins of diagnostics so that reported items can be cleared
 * up, when all its origins are closed. This allows the plugin to report
 * validation issues only on what is currently open, taking into account that
 * diagnostics generated for one file can have items that concern other files.
 */
export class ValidationManager {
  private connection: Connection;
  private documents: TextDocuments<TextDocument>;

  private validationCache: Map<string, IntervalTree<Diagnostic>> = new Map();

  /**
   * Mapping from file that generated diagnostics (origin), to files included in
   * those diagnostics.
   */
  private referencedFilesByOrigin: Map<string, Set<string>> = new Map();

  /**
   * Mapping from file to number of distinct files (origins) for which that file
   * had diagnostics generated.
   */
  private referencedFileRefCounter: Map<string, number> = new Map();

  constructor(connection: Connection, documents: TextDocuments<TextDocument>) {
    this.connection = connection;
    this.documents = documents;
  }

  /**
   * Processes changes in diagnostics and sends the diagnostics to the client.
   */
  public processDiagnostics(
    originFileUri: string,
    diagnosticsByFile: Map<string, Diagnostic[]>,
  ): void {
    if (!this.documents.get(originFileUri)) {
      // the origin file has been closed before the diagnostics were delivered
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
      // this file is no longer referenced by origin
      referencedFiles.delete(fileUri);
      this.handleFileUnreferenced(fileUri);
    }

    for (const [fileUri] of diagnosticsByFile) {
      if (!referencedFiles.has(fileUri)) {
        // this file has not been referenced by origin before
        referencedFiles.add(fileUri);
        this.handleFileReferenced(fileUri);
      }
    }

    // send the diagnostics to the client
    for (const [fileUri, fileDiagnostics] of diagnosticsByFile) {
      this.connection.sendDiagnostics({
        uri: fileUri,
        diagnostics: fileDiagnostics,
      });
    }
  }

  /**
   * Saves the diagnostics in a cache for later reuse in quick validation.
   */
  public cacheDiagnostics(
    originFileUri: string,
    cacheableDiagnostics: Map<string, Diagnostic[]>,
  ): void {
    if (!this.documents.get(originFileUri)) {
      // the origin file has been closed before the diagnostics were delivered
      return;
    }
    for (const [fileUri, fileDiagnostics] of cacheableDiagnostics) {
      // save validation cache for each impacted file
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
    if (diagnosticTree) {
      for (const change of changes) {
        if ("range" in change) {
          const invalidatedDiagnostics = diagnosticTree.search([
            change.range.start.line,
            change.range.end.line,
          ]);
          if (invalidatedDiagnostics) {
            for (const diagnostic of invalidatedDiagnostics as Array<Diagnostic>) {
              diagnosticTree.remove(
                [diagnostic.range.start.line, diagnostic.range.end.line],
                diagnostic,
              );
            }
          }

          // determine whether lines have been added or removed by subtracting
          // change lines count from number of newline characters in the change
          let displacement = 0;
          displacement -= change.range.end.line - change.range.start.line;
          displacement += change.text.match(/\n|\r\n|\r/g)?.length || 0;
          if (displacement) {
            const displacedDiagnostics = diagnosticTree.search([
              change.range.start.line,
              integer.MAX_VALUE,
            ]);
            if (displacedDiagnostics) {
              for (const diagnostic of displacedDiagnostics as Array<Diagnostic>) {
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
    }
  }

  public getValidationFromCache(
    fileUri: string,
  ): Map<string, Diagnostic[]> | undefined {
    const referencedFiles = this.referencedFilesByOrigin.get(fileUri);
    if (referencedFiles) {
      // hit on origin of diagnostics
      const diagnosticsByFile: Map<string, Diagnostic[]> = new Map();
      for (const referencedFileUri of referencedFiles) {
        const diagnostics = this.validationCache.get(referencedFileUri);
        if (diagnostics) {
          diagnosticsByFile.set(referencedFileUri, diagnostics.values);
        }
      }
      return diagnosticsByFile;
    } else {
      const diagnostics = this.validationCache.get(fileUri);
      if (diagnostics) {
        // direct hit on given file
        return new Map([[fileUri, diagnostics.values]]);
      }
    }
  }

  public handleDocumentClosed(fileUri: string): void {
    const referencedFiles = this.referencedFilesByOrigin.get(fileUri);
    if (referencedFiles) {
      referencedFiles.forEach((f) => this.handleFileUnreferenced(f));
      // remove the diagnostics origin file from tracking
      this.referencedFilesByOrigin.delete(fileUri);
    }
  }

  private handleFileReferenced(fileUri: string) {
    this.referencedFileRefCounter.set(fileUri, this.getRefCounter(fileUri) + 1);
  }

  private handleFileUnreferenced(fileUri: string) {
    const counter = this.getRefCounter(fileUri) - 1;
    if (counter <= 0) {
      // clear diagnostics of files that are no longer referenced
      this.validationCache.delete(fileUri);
      this.connection.sendDiagnostics({
        uri: fileUri,
        diagnostics: [],
      });
      // remove file from reference counter
      this.referencedFileRefCounter.delete(fileUri);
    } else {
      this.referencedFileRefCounter.set(fileUri, counter);
    }
  }

  private getRefCounter(fileUri: string) {
    let counter = this.referencedFileRefCounter.get(fileUri);
    if (counter === undefined) {
      counter = 0;
      this.referencedFileRefCounter.set(fileUri, counter);
    }
    return counter;
  }
}
