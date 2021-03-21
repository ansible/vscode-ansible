import * as fs from 'fs';
import * as path from 'path';
import { parseDocument } from 'yaml';
import { YAMLError } from 'yaml/util';

export class DocsParser {
  public static docsRegex = /\s*DOCUMENTATION\s*=\s*r?('''|""")(?:\n---)?\n?(?<doc>.*?)\1/s;

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
          const pathArray = f.split(path.sep);
          return pathArray[pathArray.length - 2] === 'modules';
        };
        break;
    }
    return Promise.all(
      files.filter(filter).map(async (file) => {
        const name = path.basename(file, '.py');
        let namespace;
        let collection;
        switch (kind) {
          case 'builtin':
            namespace = 'ansible';
            collection = 'builtin';
            break;
          case 'collection':
            const pathArray = file.split(path.sep);
            namespace = pathArray[pathArray.length - 5];
            collection = pathArray[pathArray.length - 4];
            break;
        }

        return new LazyModuleDocumentation(
          file,
          `${namespace}.${collection}.${name}`,
          namespace,
          collection,
          name
        );
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
    const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
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
  contents: Record<string, unknown>;
  errors: YAMLError[];
}

export class LazyModuleDocumentation implements IModuleDocumentation {
  source: string;
  fqcn: string;
  namespace: string;
  collection: string;
  name: string;
  errors: YAMLError[] = [];

  private _contents: Record<string, unknown> | undefined;

  constructor(
    source: string,
    fqcn: string,
    namespace: string,
    collection: string,
    name: string
  ) {
    this.source = source;
    this.fqcn = fqcn;
    this.namespace = namespace;
    this.collection = collection;
    this.name = name;
  }

  public get contents(): Record<string, unknown> {
    if (!this._contents) {
      const contents = fs.readFileSync(this.source, { encoding: 'utf8' });
      const m = DocsParser.docsRegex.exec(contents);
      if (m && m.groups && m.groups.doc) {
        const document = parseDocument(m.groups.doc);
        // There's about 20 modules (out of ~3200) in Ansible 2.9 libs that contain YAML syntax errors
        // Still, document.toJSON() works on them
        this._contents = document.toJSON();
        this.errors = document.errors;
      }
      this._contents = this._contents || {};
    }
    return this._contents;
  }
}
