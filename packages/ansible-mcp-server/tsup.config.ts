import type { Options } from "tsup";
import { cpSync } from "node:fs";
import { builtinModules } from "node:module";

const env = process.env.NODE_ENV;
const outDir = env === "production" ? "dist" : "lib";

export const tsup: Options = {
  clean: true,
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  entryPoints: ["src/cli.ts", "src/server.ts"],
  minify: env === "production",
  bundle: env === "production",
  entry: ["src/**/*.ts"],
  format: ["esm", "cjs"],
  outDir,
  splitting: false,
  watch: env === "development",
  skipNodeModulesBundle: false,
  noExternal: [/./],
  external: [...builtinModules],
  async onSuccess() {
    const dataTarget =
      env === "production" ? `${outDir}/data` : `${outDir}/resources/data`;
    cpSync("src/resources/data", dataTarget, { recursive: true });
  },
};
