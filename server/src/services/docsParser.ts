import * as fs from 'fs';
import * as path from 'path';
import { parseDocument } from 'yaml';
import { YAMLError } from 'yaml/util';
import { IModuleMetadata } from './docsLibrary';
import globby = require('globby');

export class DocsParser {
  public static docsRegex =
    /(?<pre>[ \t]*DOCUMENTATION\s*=\s*r?(?<quotes>'''|""")(?:\n---)?\n?)(?<doc>.*?)\k<quotes>/s;

  public static async parseDirectory(
    dir: string,
    kind:
      | 'builtin'
      | 'collection'
      | 'builtin_doc_fragment'
      | 'collection_doc_fragment'
  ): Promise<IModuleMetadata[]> {
    let files;
    switch (kind) {
      case 'builtin':
        files = await globby([`${dir}/**/*.py`, '!/**/_*.py']);
        break;
      case 'builtin_doc_fragment':
        files = await globby([
          `${path.resolve(dir, '../')}/plugins/doc_fragments/*.py`,
          '!/**/_*.py',
        ]);
        break;
      case 'collection':
        files = await globby([`${dir}/**/modules/*.py`, `!${dir}/**/_*.py`]);
        break;
      case 'collection_doc_fragment':
        files = await globby([
          `${dir}/**/doc_fragments/*.py`,
          `!${dir}/**/doc_fragments/_*.py`,
        ]);
        break;
    }
    return Promise.all(
      files.map(async (file) => {
        const name = path.basename(file, '.py');
        let namespace;
        let collection;
        switch (kind) {
          case 'builtin':
          case 'builtin_doc_fragment':
            namespace = 'ansible';
            collection = 'builtin';
            break;
          case 'collection':
          case 'collection_doc_fragment':
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
    );
  }
}

export class LazyModuleDocumentation implements IModuleMetadata {
  source: string;
  sourceLineRange: [number, number] = [0, 0];
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

  public get rawDocumentation(): Record<string, unknown> {
    if (!this._contents) {
      const contents = fs.readFileSync(this.source, { encoding: 'utf8' });
      const m = DocsParser.docsRegex.exec(contents);
      if (m && m.groups && m.groups.doc && m.groups.pre) {
        // determine documentation start/end lines for definition provider
        let startLine = contents.substr(0, m.index).match(/\n/g)?.length || 0;
        startLine += m.groups.pre.match(/\n/g)?.length || 0;
        const endLine = startLine + (m.groups.doc.match(/\n/g)?.length || 0);
        this.sourceLineRange = [startLine, endLine];

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

  public set rawDocumentation(value: Record<string, unknown>) {
    this._contents = value;
  }
}
