#!/usr/bin/env node
import process from "node:process";

declare const PACKAGE_VERSION: string;

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));

  if (args.has("--version")) {
    console.log(PACKAGE_VERSION);
    process.exit(0);
  }

  if (args.has("--generate-docs")) {
    const outputPath =
      process.argv[process.argv.indexOf("--generate-docs") + 1];
    if (!outputPath || outputPath.startsWith("--")) {
      console.error(
        "Usage: ansible-language-server --generate-docs <output-md-file>",
      );
      process.exit(1);
    }
    try {
      const { generateSettingsDocs } =
        await import("@src/settings-doc-generator");
      generateSettingsDocs(outputPath);
    } catch (err: unknown) {
      console.error(err);
      process.exit(1);
    }
    process.exit(0);
  }

  try {
    await import("./server.js");
  } catch (err: unknown) {
    console.error(err);
    process.exit(1);
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
