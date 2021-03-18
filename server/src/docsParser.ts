import { promises as fs } from 'fs';
import * as path from 'path';
import { parseDocument } from 'yaml';
import { YAMLError } from 'yaml/util';

export class DocsParser {
  private static docsRegex = /\s*DOCUMENTATION\s*=\s*r?('''|""")(?:\n---)?\n?(?<doc>.*?)\1/s;

  public static async parseDirectory(
    dir: string,
    kind: 'builtin' | 'collection'
  ): Promise<IModuleDocumentation[]> {
    const files = await this._getFiles(dir);
    let filter;
    switch (kind) {
      case 'builtin':
        filter = () => true;
        break;
      case 'collection':
        filter = (f: string) => {
          const subPathArray = f.substr(dir.length).split(path.sep);
          return subPathArray[subPathArray.length - 2] === 'modules';
        };
        break;
    }
    return Promise.all(
      files.filter(filter).map(async (file) => {
        const contents = await fs.readFile(file, { encoding: 'utf8' });
        const m = this.docsRegex.exec(contents);
        if (m && m.groups && m.groups.doc) {
          const document = parseDocument(m.groups.doc);
          // There's about 20 modules (out of ~3200) in Ansible 2.9 libs that contain YAML syntax errors
          // Still, document.toJSON() works on them
          const contents = document.toJSON();
          const name = contents.module as string;
          let namespace;
          let collection;
          switch (kind) {
            case 'builtin':
              namespace = 'ansible';
              collection = 'builtin';
              break;
            case 'collection':
              const subPathArray = file.substr(dir.length).split(path.sep);
              namespace = subPathArray[1]; // the first entry is 'ansible_collections'
              collection = subPathArray[2];
              break;
          }

          return {
            source: file,
            fqcn: `${namespace}.${collection}.${name}`,
            namespace: namespace,
            collection: collection,
            name: name,
            contents: contents,
            errors: document.errors,
          };
        }
      })
    ).then((results) => {
      return results.filter(
        (
          i: IModuleDocumentation | null | undefined
        ): i is IModuleDocumentation => !!i
      );
    });
  }

  private static async _getFiles(dir: string): Promise<Array<string>> {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      dirents
        .filter((dirent) => {
          return (
            dirent.isDirectory() ||
            (dirent.isFile() &&
              dirent.name.endsWith('.py') &&
              !dirent.name.startsWith('_')) // legacy files and __init__.py
          );
        })
        .map((dirent) => {
          const res = path.resolve(dir, dirent.name);
          return dirent.isDirectory() ? this._getFiles(res) : [res];
        })
    );
    return files.flat();
  }
}

export function collectionModuleFilter(
  baseDir: string
): (value: string) => boolean {
  return (f: string) => {
    const subPathArray = f.substr(baseDir.length).split(path.sep);
    return subPathArray[subPathArray.length - 2] === 'modules';
  };
}

export interface IModuleDocumentation {
  source: string;
  fqcn: string;
  namespace: string;
  collection: string;
  name: string;
  contents: any;
  errors: YAMLError[];
}
