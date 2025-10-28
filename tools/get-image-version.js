#!/usr/bin/env node

const { readFileSync, existsSync } = require("fs");

let version = "latest";

const containerfilePath = ".config/Containerfile";

if (existsSync(containerfilePath)) {
  const content = readFileSync(containerfilePath, "utf-8");
  const lines = content.split("\n");

  for (const line of lines) {
    if (line.startsWith("FROM")) {
      // Extract version after colon
      const colonIndex = line.indexOf(":");
      if (colonIndex !== -1) {
        version = line.substring(colonIndex + 1);
        // Strip anything after a space
        const spaceIndex = version.indexOf(" ");
        if (spaceIndex !== -1) {
          version = version.substring(0, spaceIndex);
        }
      }
      break;
    }
  }
}

process.stdout.write(version);

