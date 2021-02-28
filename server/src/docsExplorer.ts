import { promises as fs } from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { parseDocument, Document } from 'yaml';
import { YAMLError } from 'yaml/util';

const ansibleLibPath = '/usr/local/lib/python3.6/dist-packages/ansible';

const modulesPath = path.join(ansibleLibPath, 'modules');

const documentationMap = new Map<string, string>();
const yamlDocMap = new Map<string, Document.Parsed>();

// getFiles(modulesPath).then(async (files) => {
//   const start = performance.now();
//   await Promise.all(
//     files.map(async (file) => {
//       const contents = await fs.readFile(file, { encoding: 'utf8' });
//       const m = docsRegex.exec(contents);
//       if (m && m.groups && m.groups.doc) {
//         documentationMap.set(file, m.groups.doc);
//         const document = parseDocument(m.groups.doc);
//         const moduleName = document.toJSON().module;
//         if (yamlDocMap.has(moduleName)) {
//           console.log(`Duplicate module ${moduleName} in ${file}`);
//         }
//         yamlDocMap.set(moduleName, document);
//         if (
//           document.errors.length > 0 &&
//           document.errors.some((e) => e.name === 'YAMLSyntaxError')
//         ) {
//           // There's about 20 modules (out of ~3700) that contain YAML syntax errors
//           // Still, document.toJSON() works on them
//           // document.toJSON();
//           // console.log(`Errors in ${file}:\n${document.errors}`);
//         }
//       }
//     })
//   );
//   const stop = performance.now();
//   console.log(`Took ${stop - start}ms`);
// });

export async function getFiles(dir: string): Promise<Array<string>> {
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
        return dirent.isDirectory() ? getFiles(res) : [res];
      })
  );
  return files.flat();
}

export class DocsParser {
  private static docsRegex = /\s*DOCUMENTATION\s*=\s*r?('''|""")(?:\n---)?\n?(?<doc>.*?)\1/s;

  public static async parseDirectory(dir: string): Promise<IDocumentation[]> {
    const files = await DocsParser._getFiles(dir);
    return await Promise.all(
      files.map(async (file) => {
        const contents = await fs.readFile(file, { encoding: 'utf8' });
        const m = DocsParser.docsRegex.exec(contents);
        if (m && m.groups && m.groups.doc) {
          const document = parseDocument(m.groups.doc);
          // There's about 20 modules (out of ~3300) in Ansible 2.9 libs that contain YAML syntax errors
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
          return dirent.isDirectory() ? getFiles(res) : [res];
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
