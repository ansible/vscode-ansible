import { defineConfig, Options } from "tsup";
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

function generateConfig(env: "production" | "development"): Options {
  return {
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
    ],
    minify: env === "production",
    bundle: env === "production",
    entry: ["src/**/*.ts"],
    format: ["esm", "cjs"],
    outDir: env === "production" ? "dist" : "lib",
    replaceNodeEnv: true,
    splitting: false,
    watch: process.env.NODE_ENV === "development",
    skipNodeModulesBundle: false,
    noExternal: [/./],
    external: [...builtinModules],
    define: {
      PACKAGE_VERSION: JSON.stringify(pkg.version),
    },
  };
}

export default defineConfig([
  generateConfig("production"),
  generateConfig("development"),
]);
