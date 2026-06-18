import { defineConfig, Options } from "tsup";
import { cpSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

function generateConfig(env: "production" | "development"): Options {
  const outDir = env === "production" ? "dist" : "lib";
  return {
    clean: true,
    dts: {
      compilerOptions: {
        composite: false,
        // tsup injects baseUrl for path mapping; TS 6 treats that as deprecated (egoist/tsup#1388)
        ignoreDeprecations: "6.0",
      },
    },
    entryPoints: ["src/cli.ts", "src/server.ts"],
    minify: env === "production",
    bundle: env === "production",
    entry: ["src/**/*.ts"],
    format: ["esm", "cjs"],
    outDir,
    replaceNodeEnv: true,
    splitting: false,
    watch: process.env.NODE_ENV === "development",
    skipNodeModulesBundle: false,
    noExternal: [/./],
    external: [...builtinModules],
    define: {
      PACKAGE_VERSION: JSON.stringify(pkg.version),
    },
    async onSuccess() {
      const dataTarget =
        env === "production" ? `${outDir}/data` : `${outDir}/resources/data`;
      cpSync("src/resources/data", dataTarget, { recursive: true });
    },
  };
}

export default defineConfig([
  generateConfig("production"),
  generateConfig("development"),
]);
