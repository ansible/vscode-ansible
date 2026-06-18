import { defineConfig, type UserConfig } from "tsdown";
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

function generateConfig(env: "production" | "development"): UserConfig {
  const isProduction = env === "production";
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
    outDir: isProduction ? "dist" : "lib",
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
  };
}

export default defineConfig([
  generateConfig("production"),
  generateConfig("development"),
]);
