import { format } from "util";
import { MarkupContent, MarkupKind } from "vscode-languageserver";
import { parse, toMD } from "antsibull-docs";
import {
  IDescription,
  IModuleDocumentation,
  IOption,
} from "../interfaces/module";
import { IPluginRoute } from "../interfaces/pluginRouting";

export function formatModule(
  module: IModuleDocumentation,
  route?: IPluginRoute,
): MarkupContent {
  const sections: string[] = [];
  if (module.deprecated || route?.deprecation) {
    sections.push("**DEPRECATED**");
    if (route?.deprecation) {
      if (route.deprecation.warningText) {
        sections.push(`${route.deprecation.warningText}`);
      }
      sections.push(
        `Removal date: ${route.deprecation.removalDate}, removal version: ${route.deprecation.removalVersion}`,
      );
    }
  }
  if (route?.redirect) {
    sections.push(`***Redirected to: ${route.redirect}***`);
  }
  if (module.shortDescription) {
    sections.push(`*${formatDescription(module.shortDescription)}*`);
  }
  if (module.description) {
    sections.push("**Description**");
    sections.push(formatDescription(module.description));
  }
  if (module.requirements) {
    sections.push("**Requirements**");
    sections.push(formatDescription(module.requirements));
  }
  if (module.notes) {
    sections.push("**Notes**");
    sections.push(formatDescription(module.notes));
  }
  return {
    kind: MarkupKind.Markdown,
    value: sections.join("\n\n"),
  };
}

export function formatTombstone(route: IPluginRoute): MarkupContent {
  const sections: string[] = [];
  if (route?.tombstone) {
    sections.push("**REMOVED**");
    if (route.tombstone.warningText) {
      sections.push(`${route.tombstone.warningText}`);
    }
    sections.push(
      `Removal date: ${route.tombstone.removalDate}, removal version: ${route.tombstone.removalVersion}`,
    );
  }
  if (route?.redirect) {
    sections.push(`Use *${route.redirect}* instead.`);
  }
  return {
    kind: MarkupKind.Markdown,
    value: sections.join("\n\n"),
  };
}

export function formatOption(
  option: IOption,
  with_details = false,
): MarkupContent {
  const sections: string[] = [];
  if (with_details) {
    const details = getDetails(option);
    if (details) {
      sections.push(`\`${details}\``);
    }
  }
  if (option.description) {
    sections.push(formatDescription(option.description, false));
  }
  if (option.default !== undefined) {
    sections.push(
      `*Default*:\n \`\`\`javascript\n${format(option.default)}\n\`\`\``,
    );
  }
  if (option.choices) {
    const formattedChoiceArray = option.choices.map((c) => `\`${c}\``);
    sections.push(`*Choices*: [${formattedChoiceArray.toString()}]`);
  }
  if (option.aliases) {
    const aliasesWithBaseName = [option.name].concat(option.aliases);
    const formattedChoiceArray = aliasesWithBaseName.map((a) => `\`${a}\``);
    sections.push(`*Aliases*: [${formattedChoiceArray.toString()}]`);
  }
  return {
    kind: MarkupKind.Markdown,
    value: sections.join("\n\n"),
  };
}

export function formatDescription(doc?: IDescription, asList = true): string {
  let result = "";
  if (doc instanceof Array) {
    const lines: string[] = [];
    doc.forEach((element) => {
      if (asList) {
        lines.push(`- ${replaceMacros(element)}`);
      } else {
        lines.push(`${replaceMacros(element)}\n`);
      }
    });
    result += lines.join("\n");
  } else if (typeof doc === "string") {
    result += replaceMacros(doc);
  }
  return result;
}

export function getDetails(option: IOption): string | undefined {
  const details = [];
  if (option.required) {
    details.push("(required)");
  }
  if (option.type) {
    if (option.type === "list" && option.elements) {
      details.push(`list(${option.elements})`);
    } else {
      details.push(option.type);
    }
  }
  if (details) return details.join(" ");
}

// TODO: do something with links
function replaceMacros(text: unknown): string {
  let safeText;
  if (typeof text === "string") {
    safeText = text;
  } else {
    safeText = JSON.stringify(text);
  }
  return toMD(parse(safeText));
}
