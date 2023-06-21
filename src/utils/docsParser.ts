import * as _ from "lodash";
import * as fs from "fs";
import { parseDocument, YAMLError } from "yaml";
import {
  IDescription,
  IModuleDocumentation,
  IModuleMetadata,
  IOption,
} from "../interfaces/module";
import { hasOwnProperty, isObject } from "./misc";
import {
  IPluginRoute,
  IPluginRoutesByName,
  IPluginRoutesByType,
  IPluginTypes,
} from "../interfaces/pluginRouting";

const DOCUMENTATION = "DOCUMENTATION";

export function processDocumentationFragments(
  module: IModuleMetadata,
  docFragments: Map<string, IModuleMetadata>,
): void {
  module.fragments = [];
  const mainDocumentationFragment =
    module.rawDocumentationFragments.get(DOCUMENTATION);
  if (
    mainDocumentationFragment &&
    hasOwnProperty(mainDocumentationFragment, "extends_documentation_fragment")
  ) {
    const docFragmentNames: string[] =
      mainDocumentationFragment.extends_documentation_fragment instanceof Array
        ? mainDocumentationFragment.extends_documentation_fragment
        : [mainDocumentationFragment.extends_documentation_fragment];
    const resultContents = {};
    for (const docFragmentName of docFragmentNames) {
      const fragmentNameArray = docFragmentName.split(".");
      let fragmentPartName: string;
      if (fragmentNameArray.length === 2 || fragmentNameArray.length === 4) {
        fragmentPartName = fragmentNameArray.pop()?.toUpperCase() as string;
      } else {
        fragmentPartName = DOCUMENTATION;
      }
      const docFragmentCatalogueName = fragmentNameArray.join(".");
      const docFragment =
        docFragments.get(docFragmentCatalogueName) ||
        docFragments.get(`ansible.builtin.${docFragmentCatalogueName}`);
      if (
        docFragment &&
        docFragment.rawDocumentationFragments.has(fragmentPartName)
      ) {
        module.fragments.push(docFragment); // currently used only as indicator
        _.mergeWith(
          resultContents,
          docFragment.rawDocumentationFragments.get(fragmentPartName),
          docFragmentMergeCustomizer,
        );
      }
    }
    _.mergeWith(
      resultContents,
      mainDocumentationFragment,
      docFragmentMergeCustomizer,
    );
    module.rawDocumentationFragments.set(DOCUMENTATION, resultContents);
  }
}

function docFragmentMergeCustomizer(
  objValue: unknown,
  srcValue: unknown,
  key: string,
): Record<string, unknown>[] | undefined {
  if (
    ["notes", "requirements", "seealso"].includes(key) &&
    _.isArray(objValue)
  ) {
    return objValue.concat(srcValue);
  }
}

export function processRawDocumentation(
  moduleDocParts: Map<string, Record<string, unknown>>,
): IModuleDocumentation | undefined {
  // currently processing only the main documentation
  const rawDoc = moduleDocParts.get(DOCUMENTATION);
  if (rawDoc && typeof rawDoc.module === "string") {
    const moduleDoc: IModuleDocumentation = {
      module: rawDoc.module,
      options: processRawOptions(rawDoc.options),
      deprecated: !!rawDoc.deprecated,
    };
    if (isIDescription(rawDoc.short_description))
      moduleDoc.shortDescription = rawDoc.short_description;
    if (isIDescription(rawDoc.description))
      moduleDoc.description = rawDoc.description;
    if (typeof rawDoc.version_added === "string")
      moduleDoc.versionAdded = rawDoc.version_added;
    if (isIDescription(rawDoc.author)) moduleDoc.author = rawDoc.author;
    if (isIDescription(rawDoc.requirements))
      moduleDoc.requirements = rawDoc.requirements;
    if (typeof rawDoc.seealso === "object")
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
          suboptions: processRawOptions(rawOption.suboptions),
        };
        if (isIDescription(rawOption.description))
          optionDoc.description = rawOption.description;
        if (rawOption.choices instanceof Array)
          optionDoc.choices = rawOption.choices;
        if (typeof rawOption.type === "string") optionDoc.type = rawOption.type;
        if (typeof rawOption.elements === "string")
          optionDoc.elements = rawOption.elements;
        if (rawOption.aliases instanceof Array)
          optionDoc.aliases = rawOption.aliases;
        if (typeof rawOption.version_added === "string")
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
    typeof obj === "string"
  );
}

export function parseRawRouting(rawDoc: unknown): IPluginRoutesByType {
  const routesByType = new Map<IPluginTypes, IPluginRoutesByName>();
  if (
    hasOwnProperty(rawDoc, "plugin_routing") &&
    isObject(rawDoc.plugin_routing)
  ) {
    for (const [pluginType, rawRoutesByName] of Object.entries(
      rawDoc.plugin_routing,
    )) {
      if (pluginType === "modules" && isObject(rawRoutesByName)) {
        routesByType.set(pluginType, parseRawRoutesByName(rawRoutesByName));
      }
    }
  }
  return routesByType;
}

function parseRawRoutesByName(
  rawRoutesByName: Record<PropertyKey, unknown>,
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
    route.deprecation = parseRawDeprecationOrTombstone(rawRoute.deprecation);
  }
  if (isObject(rawRoute.tombstone)) {
    route.tombstone = parseRawDeprecationOrTombstone(rawRoute.tombstone);
  }
  if (typeof rawRoute.redirect === "string") {
    route.redirect = rawRoute.redirect;
  }
  return route;
}

function parseRawDeprecationOrTombstone(
  rawInfo: Record<PropertyKey, unknown>,
): {
  removalVersion?: string;
  removalDate?: string;
  warningText?: string;
} {
  let warningText;
  let removalDate;
  let removalVersion;
  if (typeof rawInfo.warning_text === "string") {
    warningText = rawInfo.warning_text;
  }
  if (typeof rawInfo.removal_date === "string") {
    removalDate = rawInfo.removal_date;
  }
  if (typeof rawInfo.removal_version === "string") {
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
    /(?<pre>[ \t]*(?<name>[A-Z0-9_]+)\s*=\s*r?(?<quotes>'''|""")(?:\n---)?\n?)(?<doc>.*?)\k<quotes>/gs;

  source: string;
  sourceLineRange: [number, number] = [0, 0];
  fqcn: string;
  namespace: string;
  collection: string;
  name: string;
  errors: YAMLError[] = [];

  private _contents: Map<string, Record<string, unknown>> | undefined;

  constructor(
    source: string,
    fqcn: string,
    namespace: string,
    collection: string,
    name: string,
  ) {
    this.source = source;
    this.fqcn = fqcn;
    this.namespace = namespace;
    this.collection = collection;
    this.name = name;
  }

  public get rawDocumentationFragments(): Map<string, Record<string, unknown>> {
    if (!this._contents) {
      this._contents = new Map<string, Record<string, unknown>>();
      const contents = fs.readFileSync(this.source, { encoding: "utf8" });
      let m;
      while ((m = LazyModuleDocumentation.docsRegex.exec(contents)) !== null) {
        if (m && m.groups && m.groups.name && m.groups.doc && m.groups.pre) {
          if (m.groups.name === DOCUMENTATION) {
            // determine documentation start/end lines for definition provider
            let startLine =
              contents.substr(0, m.index).match(/\n/g)?.length || 0;
            startLine += m.groups.pre.match(/\n/g)?.length || 0;
            const endLine =
              startLine + (m.groups.doc.match(/\n/g)?.length || 0);
            this.sourceLineRange = [startLine, endLine];
          }

          const document = parseDocument(m.groups.doc);
          // There's about 20 modules (out of ~3200) in Ansible 2.9 libs that contain YAML syntax errors
          // Still, document.toJSON() works on them
          this._contents.set(m.groups.name, document.toJSON());
          this.errors = document.errors;
        }
      }
    }
    return this._contents;
  }

  public set rawDocumentationFragments(
    value: Map<string, Record<string, unknown>>,
  ) {
    this._contents = value;
  }
}
