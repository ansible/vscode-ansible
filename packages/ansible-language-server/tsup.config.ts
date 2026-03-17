import type { Options } from "tsup";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

export const tsup: Options = {
  clean: true,
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  entry: [
    "src/cli.ts",
    "src/server.ts",
    "src/interfaces/extensionSettings.ts",
    "src/services/settingsManager.ts",
  ],
  format: ["cjs"],
  outDir: "dist",
  splitting: false,
  skipNodeModulesBundle: true,
  define: {
    PACKAGE_VERSION: JSON.stringify(pkg.version),
  },
};
