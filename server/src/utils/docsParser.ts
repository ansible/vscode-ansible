import * as _ from 'lodash';
import * as fs from 'fs';
import { parseDocument } from 'yaml';
import { YAMLError } from 'yaml/util';
import {
  IDescription,
  IModuleDocumentation,
  IModuleMetadata,
  IOption,
} from '../interfaces/module';
import { hasOwnProperty, isObject } from './misc';
import {
  IPluginRoute,
  IPluginRoutesByName,
  IPluginRoutesByType,
  IPluginTypes,
} from '../interfaces/pluginRouting';

export function processDocumentationFragments(
  module: IModuleMetadata,
  docFragments: Map<string, IModuleMetadata>
): void {
  module.fragments = [];
  if (
    hasOwnProperty(module.rawDocumentation, 'extends_documentation_fragment')
  ) {
    const docFragmentNames =
      module.rawDocumentation.extends_documentation_fragment instanceof Array
        ? module.rawDocumentation.extends_documentation_fragment
        : [module.rawDocumentation.extends_documentation_fragment];
    const resultContents = {};
    for (const docFragmentName of docFragmentNames) {
      const docFragment =
        docFragments.get(docFragmentName) ||
        docFragments.get(`ansible.builtin.${docFragmentName}`);
      if (docFragment) {
        module.fragments.push(docFragment); // currently used only as indicator
        _.mergeWith(
          resultContents,
          docFragment.rawDocumentation,
          docFragmentMergeCustomizer
        );
      }
    }
    _.mergeWith(
      resultContents,
      module.rawDocumentation,
      docFragmentMergeCustomizer
    );
    module.rawDocumentation = resultContents;
  }
}

function docFragmentMergeCustomizer(
  objValue: unknown,
  srcValue: unknown,
  key: string
): Record<string, unknown>[] | undefined {
  if (
    ['notes', 'requirements', 'seealso'].includes(key) &&
    _.isArray(objValue)
  ) {
    return objValue.concat(srcValue);
  }
}

export function processRawDocumentation(
  rawDoc: unknown
): IModuleDocumentation | undefined {
  if (isObject(rawDoc) && typeof rawDoc.module === 'string') {
    const moduleDoc: IModuleDocumentation = {
      module: rawDoc.module,
      options: processRawOptions(rawDoc.options),
      deprecated: !!rawDoc.deprecated,
    };
    if (isIDescription(rawDoc.short_description))
      moduleDoc.shortDescription = rawDoc.short_description;
    if (isIDescription(rawDoc.description))
      moduleDoc.description = rawDoc.description;
    if (typeof rawDoc.version_added === 'string')
      moduleDoc.versionAdded = rawDoc.version_added;
    if (isIDescription(rawDoc.author)) moduleDoc.author = rawDoc.author;
    if (isIDescription(rawDoc.requirements))
      moduleDoc.requirements = rawDoc.requirements;
    if (typeof rawDoc.seealso === 'object')
      moduleDoc.seealso = rawDoc.seealso as Record<string, unknown>;
    if (isIDescription(rawDoc.notes)) moduleDoc.notes = rawDoc.notes;
    return moduleDoc;
  }
}

export function processRawOptions(rawOptions: unknown): Map<string, IOption> {
  const options = new Map<string, IOption>();
  if (isObject(rawOptions)) {
    for (const [optionName, rawOption] of Object.entries(rawOptions)) {
      if (isObject(rawOption)) {
        const optionDoc: IOption = {
          name: optionName,
          required: !!rawOption.required,
          default: rawOption.default,
          suboptions: rawOption.suboptions,
        };
        if (isIDescription(rawOption.description))
          optionDoc.description = rawOption.description;
        if (rawOption.choices instanceof Array)
          optionDoc.choices = rawOption.choices;
        if (typeof rawOption.type === 'string') optionDoc.type = rawOption.type;
        if (typeof rawOption.elements === 'string')
          optionDoc.elements = rawOption.elements;
        if (rawOption.aliases instanceof Array)
          optionDoc.aliases = rawOption.aliases;
        if (typeof rawOption.version_added === 'string')
          optionDoc.versionAdded = rawOption.version_added;
        options.set(optionName, optionDoc);
        if (optionDoc.aliases) {
          for (const alias of optionDoc.aliases) {
            options.set(alias, optionDoc);
          }
        }
      }
    }
  }
  return options;
}

function isIDescription(obj: unknown): obj is IDescription {
  return (
    obj instanceof Array || // won't check that all elements are string
    typeof obj === 'string'
  );
}

export function parseRawRouting(rawDoc: unknown): IPluginRoutesByType {
  const routesByType = new Map<IPluginTypes, IPluginRoutesByName>();
  if (
    hasOwnProperty(rawDoc, 'plugin_routing') &&
    isObject(rawDoc.plugin_routing)
  ) {
    for (const [pluginType, rawRoutesByName] of Object.entries(
      rawDoc.plugin_routing
    )) {
      if (pluginType === 'modules' && isObject(rawRoutesByName)) {
        routesByType.set(pluginType, parseRawRoutesByName(rawRoutesByName));
      }
    }
  }
  return routesByType;
}

function parseRawRoutesByName(
  rawRoutesByName: Record<PropertyKey, unknown>
): IPluginRoutesByName {
  const routesByName = new Map<string, IPluginRoute>();
  for (const [moduleName, rawRoute] of Object.entries(rawRoutesByName)) {
    if (isObject(rawRoute))
      routesByName.set(moduleName, parseRawRoute(rawRoute));
  }
  return routesByName;
}

function parseRawRoute(rawRoute: Record<PropertyKey, unknown>): IPluginRoute {
  const route: IPluginRoute = {};
  if (isObject(rawRoute.deprecation)) {
    route.deprecation = parseRawDepracationOrTombstone(rawRoute.deprecation);
  }
  if (isObject(rawRoute.tombstone)) {
    route.tombstone = parseRawDepracationOrTombstone(rawRoute.tombstone);
  }
  if (typeof rawRoute.redirect === 'string') {
    route.redirect = rawRoute.redirect;
  }
  return route;
}

function parseRawDepracationOrTombstone(
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
