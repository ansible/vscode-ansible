#!/usr/bin/env node
import process from "node:process";
import { runStdio } from "./server.js";

const args = new Set(process.argv.slice(2));
const root = process.env.WORKSPACE_ROOT || process.cwd();

(async () => {
  if (args.has("--stdio")) {
    await runStdio(root);
    return; // keep process alive until client disconnects
  }

  if (args.has("--ws") || args.has("--websocket")) {
    console.log(
      "WebSocket mode is not available in this build. Use --stdio with an MCP client.",
    );
    process.exit(2);
  }

  console.log(`Usage:
  ansible-mcp-server --stdio
  WORKSPACE_ROOT=/path MCP_PORT=3030 MCP_TOKEN=secret ansible-mcp-server --ws`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
