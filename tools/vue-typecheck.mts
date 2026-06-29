/**
 * Vue SFC typecheck via vue-tsc using the classic TypeScript 6 compiler API.
 * TS 7 (native preview) ships a tsc shim that vue-tsc cannot patch.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { run } = require("vue-tsc") as typeof import("vue-tsc");

run(require.resolve("typescript/lib/tsc"));
