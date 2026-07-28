---
title: Add go-to-definition that opens PluginDocPanel
created: 2026-05-26
status: complete
priority: medium
scope: ls
---

# Add go-to-definition that opens PluginDocPanel

## Context

`main` has a definition provider that jumps to the Python source file
of a module. `next` has no definition provider but has the centralized
plugin doc cache (ADR-002) and a rich PluginDocPanel webview.

Rather than resolving Python source paths (which requires DocsLibrary),
go-to-definition should open the PluginDocPanel webview for the
targeted FQCN.

## Acceptance criteria

- [x] Ctrl+click / F12 on a module FQCN in a task opens PluginDocPanel
- [x] The language server registers a `definitionProvider` capability
- [x] Works for both short names and FQCNs

## Notes

The LS will need to send a custom notification or command link to the
client since webview panels can only be opened from the extension host,
not from the language server process directly.

Implemented via `ansible/openPluginDoc` notification from the language
server; the extension host opens `PluginDocPanel.show`.
