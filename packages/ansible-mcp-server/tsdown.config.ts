import { defineConfig, type UserConfig } from "tsdown";
import { cpSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

function generateConfig(env: "production" | "development"): UserConfig {
  const isProduction = env === "production";
  const outDir = isProduction ? "dist" : "lib";
  return {
    clean: true,
    dts: {
      compilerOptions: {
        composite: false,
        // tsdown may inject baseUrl for path mapping; TS 6 treats that as deprecated
        ignoreDeprecations: "6.0",
      } as { composite: false; ignoreDeprecations: "6.0" },
    },
    entry: ["src/**/*.ts"],
    minify: isProduction,
    unbundle: !isProduction,
    format: ["esm", "cjs"],
    outExtensions({ format }) {
      return {
        js: format === "cjs" ? ".cjs" : ".js",
      };
    },
    outDir,
    platform: "node",
    target: "es2022",
    env: {
      NODE_ENV: isProduction ? "production" : "development",
    },
    deps: {
      alwaysBundle: [/./],
      neverBundle: [...builtinModules],
    },
    define: {
      PACKAGE_VERSION: JSON.stringify(pkg.version),
    },
    hooks: {
      "build:done": async () => {
        const dataTarget = isProduction
          ? `${outDir}/data`
          : `${outDir}/resources/data`;
        cpSync("src/resources/data", dataTarget, { recursive: true });
      },
    },
  };
}

export default defineConfig([
  generateConfig("production"),
  generateConfig("development"),
]);
