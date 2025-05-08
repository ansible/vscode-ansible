#!/usr/bin/env node --import=tsx
import fs from "fs";
import path from "path";

const REPORT_DIR = path.resolve(__dirname, "../out/junit");

function isXmlFile(filePath: string): boolean {
  return path.extname(filePath) === ".xml";
}

function getXmlFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      return getXmlFiles(fullPath);
    } else if (stat.isFile() && isXmlFile(fullPath)) {
      return [fullPath];
    }
    return [];
  });
}

function makePathsRelative(content: string, basePath: string): string {
  const escapedBase = basePath.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const regex = new RegExp(escapedBase + "/", "g");
  return content.replace(regex, "");
}

function fixJunitPathsInFolder(folder: string) {
  const basePath = process.cwd();
  const files = getXmlFiles(folder);

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const updated = makePathsRelative(content, basePath).replace(
      /"out\/client\/(.*)\.js"/g,
      '"$1.ts"',
    );
    fs.writeFileSync(file, updated, "utf-8");
    console.log(`Patched junit paths in: ${file}`);
  }
}

// Run the fixer
fixJunitPathsInFolder(REPORT_DIR);
