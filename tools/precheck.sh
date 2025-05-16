#!/usr/bin/env bash

# Check that NODE_OPTIONS is set and contains "--max-old-space-size"
if [[ "${NODE_OPTIONS:-}" != *"--max-old-space-size"* ]]; then
  echo "FATAL: NODE_OPTIONS variable was not found, this likely means that .env file was not loaded. Build will likely fail." >&2
  exit 98
fi
