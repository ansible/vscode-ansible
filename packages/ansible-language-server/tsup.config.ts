import type { Options } from "tsup";
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";

const env = process.env.NODE_ENV;
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
  entryPoints: [
    "src/cli.ts",
    "src/server.ts",
    "src/interfaces/extensionSettings.ts",
    "src/providers/completionProvider.ts",
    "src/services/schemaValidator.ts",
    // "src/services/settingsManager.ts",
  ],
  minify: env === "production",
  bundle: env === "production",
  entry: ["src/**/*.ts"],
  format: ["esm", "cjs"],
  outDir: env === "production" ? "dist" : "lib",
  splitting: false,
  watch: env === "development",
  skipNodeModulesBundle: false,
  noExternal: [/./],
  external: builtinModules,
  define: {
    PACKAGE_VERSION: JSON.stringify(pkg.version),
  },
};
