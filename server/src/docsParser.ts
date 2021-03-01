import { promises as fs } from 'fs';
import * as path from 'path';
import { parseDocument } from 'yaml';
import { YAMLError } from 'yaml/util';

export class DocsParser {
  private static docsRegex = /\s*DOCUMENTATION\s*=\s*r?('''|""")(?:\n---)?\n?(?<doc>.*?)\1/s;

  public static async parseDirectory(dir: string): Promise<IDocumentation[]> {
    const files = await this._getFiles(dir);
    return Promise.all(
      files.map(async (file) => {
        const contents = await fs.readFile(file, { encoding: 'utf8' });
        const m = this.docsRegex.exec(contents);
        if (m && m.groups && m.groups.doc) {
          const document = parseDocument(m.groups.doc);
          // There's about 20 modules (out of ~3200) in Ansible 2.9 libs that contain YAML syntax errors
          // Still, document.toJSON() works on them
          const contents = document.toJSON();
          return {
            source: file,
            module: contents.module as string,
            contents: contents,
            errors: document.errors,
          };
        }
      })
    ).then((results) => {
      return results.filter(
        (i: IDocumentation | null | undefined): i is IDocumentation => !!i
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

export interface IDocumentation {
  source: string;
  module: string;
  contents: any;
  errors: YAMLError[];
}
