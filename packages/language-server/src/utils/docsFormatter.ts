import { format } from "util";
import { MarkupContent, MarkupKind } from "vscode-languageserver";
import { parse, toMD } from "antsibull-docs";
import type { PluginDoc, PluginOption } from "@ansible/core/out/services/CollectionsService";

export function formatModule(doc: PluginDoc): MarkupContent {
  const sections: string[] = [];

  if (doc.short_description) {
    sections.push(`*${formatDescription(doc.short_description)}*`);
  }
  if (doc.description) {
    sections.push("**Description**");
    sections.push(formatDescription(doc.description));
  }
  if (doc.requirements) {
    sections.push("**Requirements**");
    sections.push(formatDescription(doc.requirements));
  }
  if (doc.notes) {
    sections.push("**Notes**");
    sections.push(formatDescription(doc.notes));
  }

  return {
    kind: MarkupKind.Markdown,
    value: sections.join("\n\n"),
  };
}

export function formatOption(
  option: PluginOption,
  name: string,
  withDetails = false,
): MarkupContent {
  const sections: string[] = [];

  if (withDetails) {
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
    const formatted = option.choices.map((c) => `\`${c}\``);
    sections.push(`*Choices*: [${formatted.join(", ")}]`);
  }

  if (option.aliases) {
    const withBase = [name, ...option.aliases];
    const formatted = withBase.map((a) => `\`${a}\``);
    sections.push(`*Aliases*: [${formatted.join(", ")}]`);
  }

  return {
    kind: MarkupKind.Markdown,
    value: sections.join("\n\n"),
  };
}

export function getDetails(option: PluginOption): string | undefined {
  const details: string[] = [];

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

  return details.length > 0 ? details.join(" ") : undefined;
}

function formatDescription(
  doc?: string | string[],
  asList = true,
): string {
  if (!doc) return "";

  if (Array.isArray(doc)) {
    const lines = doc.map((element) =>
      asList ? `- ${replaceMacros(element)}` : `${replaceMacros(element)}\n`,
    );
    return lines.join("\n");
  }

  if (typeof doc === "string") {
    return replaceMacros(doc);
  }

  return "";
}

function replaceMacros(text: unknown): string {
  const safeText = typeof text === "string" ? text : JSON.stringify(text);
  return toMD(parse(safeText));
}
