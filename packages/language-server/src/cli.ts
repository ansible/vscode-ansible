#!/usr/bin/env node
import process from "node:process";

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));

  if (args.has("--version")) {
    console.log("0.0.1");
    process.exit(0);
  }

  try {
    await import("./server");
  } catch (err: unknown) {
    console.error(err);
    process.exit(1);
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
