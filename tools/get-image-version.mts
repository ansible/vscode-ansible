#!/usr/bin/env node
// Keep the .mts extension so Node executes this as ESM (see tools/version.mts).
import { readFileSync } from "node:fs";

/** Prefer root Containerfile; package uses Dockerfile (see ansible-language-server/.config). */
const CONFIG_PATHS = [".config/Containerfile", ".config/Dockerfile"] as const;

function main(): void {
  let version = "latest";
  let text: string | undefined;
  for (const p of CONFIG_PATHS) {
    try {
      text = readFileSync(p, "utf8");
      break;
    } catch {
      // try next
    }
  }
  if (text !== undefined) {
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith("FROM")) {
        // Match bash: version="${line#*:}"; version="${version%% *}"
        const colon = line.indexOf(":");
        if (colon !== -1) {
          version = line.slice(colon + 1);
          const space = version.indexOf(" ");
          if (space !== -1) {
            version = version.slice(0, space);
          }
        }
        break;
      }
    }
  }
  process.stdout.write(version);
}

main();
