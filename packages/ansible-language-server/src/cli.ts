#!/usr/bin/env node
import process from "node:process";

declare const PACKAGE_VERSION: string;

const args = new Set(process.argv.slice(2));

if (args.has("--version")) {
  console.log(PACKAGE_VERSION);
  process.exit(0);
}

import("./server.js").catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
