import { promises as fs } from "fs";
import { Connection } from "vscode-languageserver";
import { DidChangeWatchedFilesParams } from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { parseAllDocuments } from "yaml";
import { IDocumentMetadata } from "../interfaces/documentMeta";
import { fileExists, hasOwnProperty } from "../utils/misc";
export class MetadataLibrary {
  private connection: Connection;

  // cache of metadata contents per metadata file
  private metadata: Map<string, Thenable<IDocumentMetadata>> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
  }

  public get(uri: string): Thenable<IDocumentMetadata> | undefined {
    const metadataUri = this.getAnsibleMetadataUri(uri);
    if (metadataUri) {
      let metadata = this.metadata.get(metadataUri);
      if (!metadata) {
        metadata = this.readAnsibleMetadata(metadataUri);
        this.metadata.set(metadataUri, metadata);
      }
      return metadata;
    }
  }

  public handleWatchedDocumentChange(
    params: DidChangeWatchedFilesParams,
  ): void {
    for (const fileEvent of params.changes) {
      // remove from cache on any change
      this.metadata.delete(fileEvent.uri);
    }
  }

  /**
   * Finds a path where the metadata file for a given document should reside.
   * @returns The path or undefined in case the file cannot have any related
   * metadata file.
   */
  private getAnsibleMetadataUri(uri: string): string | undefined {
    let metaPath;
    const pathArray = uri.split("/");

    // Find first
    for (let index = pathArray.length - 1; index >= 0; index--) {
      if (pathArray[index] === "tasks") {
        metaPath = pathArray
          .slice(0, index)
          .concat("meta", "main.yml")
          .join("/");
      }
    }
    return metaPath;
  }

  private async readAnsibleMetadata(
    metadataUri: string,
  ): Promise<IDocumentMetadata> {
    const metadata = {
      source: metadataUri,
      collections: new Array<string>(),
    };
    const metadataFilePath = URI.parse(metadataUri).path;
    if (await fileExists(metadataFilePath)) {
      try {
        const metaContents = await fs.readFile(metadataFilePath, {
          encoding: "utf8",
        });
        parseAllDocuments(metaContents).forEach((metaDoc) => {
          const metaObject: unknown = metaDoc.toJSON();
          if (
            hasOwnProperty(metaObject, "collections") &&
            metaObject.collections instanceof Array
          ) {
            metaObject.collections.forEach((collection) => {
              if (typeof collection === "string") {
                metadata.collections.push(collection);
              }
            });
          }
        });
      } catch (error) {
        let msg: string = "";
        if (error instanceof Error) {
          msg = error.message;
        } else {
          msg = `${error}`;
        }
        this.connection.window.showErrorMessage(msg);
      }
    }
    return metadata;
  }
}
