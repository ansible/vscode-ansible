import * as fs from 'fs';
import * as path from 'path';
import { parseDocument } from 'yaml';
import { YAMLError } from 'yaml/util';
import {
  IModuleMetadata,
  IPluginRoute,
  IPluginRoutesByName,
  IPluginRoutesByType,
  IPluginRoutingByCollection,
  IPluginTypes,
} from './docsLibrary';
import globby = require('globby');
import { hasOwnProperty, isObject } from '../utils/misc';

export class DocsFinder {
  public static async findDocumentation(
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
        files = await globby([
          `${dir}/ansible_collections/*/*/plugins/modules/*.py`,
          `!${dir}/ansible_collections/*/*/plugins/modules/_*.py`,
        ]);
        break;
      case 'collection_doc_fragment':
        files = await globby([
          `${dir}/ansible_collections/*/*/plugins/doc_fragments/*.py`,
          `!${dir}/ansible_collections/*/*/plugins/doc_fragments/_*.py`,
        ]);
        break;
    }
    return files.map((file) => {
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
    });
  }

  public static async findPluginRouting(
    dir: string,
    kind: 'builtin' | 'collection'
  ): Promise<IPluginRoutingByCollection> {
    const pluginRouting = new Map<string, IPluginRoutesByType>();
    let files;
    switch (kind) {
      case 'builtin':
        files = [`${dir}/config/ansible_builtin_runtime.yml`];
        break;
      case 'collection':
        files = await globby([
          `${dir}/ansible_collections/*/*/meta/runtime.yml`,
        ]);
        break;
    }
    for (const file of files) {
      let collection;
      switch (kind) {
        case 'builtin':
          collection = 'ansible.builtin';
          break;
        case 'collection':
          const pathArray = file.split(path.sep);
          collection = `${pathArray[pathArray.length - 4]}.${
            pathArray[pathArray.length - 3]
          }`;
          break;
      }
      const runtimeContent = await fs.promises.readFile(file, {
        encoding: 'utf8',
      });
      const document = parseDocument(runtimeContent).toJSON();
    }

    return pluginRouting;
  }

  private parseRawRouting(rawDoc: unknown) {
    const routesByType = new Map<IPluginTypes, IPluginRoutesByName>();
    if (
      hasOwnProperty(rawDoc, 'plugin_routing') &&
      isObject(rawDoc.plugin_routing)
    ) {
      for (const [pluginType, rawRoutesByName] of Object.entries(
        rawDoc.plugin_routing
      )) {
        if (pluginType === 'modules' && isObject(rawRoutesByName)) {
          routesByType.set(
            pluginType,
            this.parseRawRoutesByName(rawRoutesByName)
          );
        }
      }
    }
  }

  private parseRawRoutesByName(
    rawRoutesByName: Record<PropertyKey, unknown>
  ): IPluginRoutesByName {
    const routesByName = new Map<string, IPluginRoute>();
    for (const [moduleName, rawRoute] of Object.entries(rawRoutesByName)) {
      if (isObject(rawRoute))
        routesByName.set(moduleName, this.parseRawRoute(rawRoute));
    }
    return routesByName;
  }

  private parseRawRoute(rawRoute: Record<PropertyKey, unknown>): IPluginRoute {
    const route: IPluginRoute = {};
    if (isObject(rawRoute.deprecation)) {
      route.deprecation = this.parseRawDepracationOrTombstone(
        rawRoute.deprecation
      );
    }
    if (isObject(rawRoute.tombstone)) {
      route.tombstone = this.parseRawDepracationOrTombstone(rawRoute.tombstone);
    }
    if (typeof rawRoute.redirect === 'string') {
      route.redirect = rawRoute.redirect;
    }
    return route;
  }

  private parseRawDepracationOrTombstone(
    rawInfo: Record<PropertyKey, unknown>
  ): {
    removalVersion?: string;
    removalDate?: string;
    warningText?: string;
  } {
    let warningText;
    let removalDate;
    let removalVersion;
    if (typeof rawInfo.warning_text === 'string') {
      warningText = rawInfo.warning_text;
    }
    if (typeof rawInfo.removal_date === 'string') {
      removalDate = rawInfo.removal_date;
    }
    if (typeof rawInfo.removal_version === 'string') {
      removalVersion = rawInfo.removal_version;
    }
    return {
      warningText: warningText,
      removalDate: removalDate,
      removalVersion: removalVersion,
    };
  }
}

export class LazyModuleDocumentation implements IModuleMetadata {
  public static docsRegex =
    /(?<pre>[ \t]*DOCUMENTATION\s*=\s*r?(?<quotes>'''|""")(?:\n---)?\n?)(?<doc>.*?)\k<quotes>/s;

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
      const m = LazyModuleDocumentation.docsRegex.exec(contents);
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
