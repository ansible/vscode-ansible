import { promises as fs } from 'fs';
import { URL } from 'url';
import { DidChangeWatchedFilesParams } from 'vscode-languageserver-protocol';
import { parseAllDocuments } from 'yaml';
import { IContext } from '../interfaces/context';
import { IDocumentMetadata } from '../interfaces/documentMeta';
import { fileExists, hasOwnProperty } from '../utils/misc';
export class MetadataLibrary {
  private context: IContext;

  // maps metadata files (also inexistent) to the documents that use it
  private metadataUsage: Map<string, Set<string>> = new Map();

  // maps metadata files to promises of parsed contents
  private metadata: Map<string, Thenable<IDocumentMetadata>> = new Map();

  constructor(context: IContext) {
    this.context = context;
  }

  public handleDocumentOpened(uri: string): void {
    const metadataUri = this.getAnsibleMetadataUri(uri);
    if (metadataUri) {
      const metadataPromise = this.getMetadata(metadataUri);
      this.context.documentMetadata.set(uri, metadataPromise);
      this.getMetadataUsage(metadataUri).add(uri);
    }
  }

  public handleDocumentClosed(uri: string): void {
    const metadataUri = this.getAnsibleMetadataUri(uri);
    if (metadataUri) {
      this.getMetadataUsage(metadataUri).delete(uri);
    }
    this.context.documentMetadata.delete(uri);
  }

  public handleWatchedDocumentChange(
    change: DidChangeWatchedFilesParams
  ): void {
    for (const fileEvent of change.changes) {
      if (this.metadata.has(fileEvent.uri)) {
        // This is one of metadata files that is/has been used. We shall
        // recreate the contents promise and make it accessible to all documents
        // that use it.
        this.metadata.delete(fileEvent.uri);
        for (const documentUri of this.getMetadataUsage(fileEvent.uri)) {
          const metadata = this.getMetadata(fileEvent.uri);
          this.context.documentMetadata.set(documentUri, metadata);
        }
      }
    }
  }

  /**
   * Finds a path where the metadata file for a given document should reside.
   * @param uri The `URI` of the document for which a metadata file path should
   * be found.
   * @returns The path or undefined in case the file cannot have any related
   * metadata file.
   */
  private getAnsibleMetadataUri(uri: string): string | undefined {
    let metaPath;
    const pathArray = uri.split('/');

    // const path = /file:\/\/(.*)/.exec(uri)?.groups
    // Find first
    for (let index = pathArray.length - 1; index >= 0; index--) {
      if (pathArray[index] === 'tasks') {
        metaPath = pathArray
          .slice(0, index)
          .concat('meta', 'main.yml')
          .join('/');
      }
    }
    return metaPath;
  }

  private getMetadata(metadataUri: string): Thenable<IDocumentMetadata> {
    if (!this.metadata.has(metadataUri)) {
      this.metadata.set(metadataUri, this.readAnsibleMetadata(metadataUri));
    }
    return this.metadata.get(metadataUri) as Thenable<IDocumentMetadata>;
  }

  private getMetadataUsage(key: string): Set<string> {
    if (!this.metadataUsage.has(key)) {
      this.metadataUsage.set(key, new Set());
    }
    return this.metadataUsage.get(key) as Set<string>;
  }

  private async readAnsibleMetadata(
    metadataUri: string
  ): Promise<IDocumentMetadata> {
    const metadata = {
      source: metadataUri,
      collections: new Array<string>(),
    };
    if (fileExists(metadataUri)) {
      try {
        const metaContents = await fs.readFile(new URL(metadataUri), {
          encoding: 'utf8',
        });
        parseAllDocuments(metaContents).forEach((metaDoc) => {
          const metaObject: unknown = metaDoc.toJSON();
          if (
            hasOwnProperty(metaObject, 'collections') &&
            metaObject.collections instanceof Array
          ) {
            metaObject.collections.forEach((collection) => {
              if (typeof collection === 'string') {
                metadata.collections.push(collection);
              }
            });
          }
        });
      } catch (error) {
        //TODO: Log debug
      }
    }
    return metadata;
  }
}
