import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/units/lightspeed-vitest/**/*.test.ts"],
  },
});
