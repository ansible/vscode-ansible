import type { Options } from "tsup";

const env = process.env.NODE_ENV;

export const tsup: Options = {
  clean: true,
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  entryPoints: ["src/server.ts"],
  minify: env === "production",
  bundle: env === "production",
  entry: ["src/**/*.ts"],
  format: ["esm", "cjs"],
  outDir: env === "production" ? "dist" : "lib",
  splitting: false,
  watch: env === "development",
  skipNodeModulesBundle: true,
};
