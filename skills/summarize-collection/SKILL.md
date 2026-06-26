---
name: Summarize Collection
description: Deep-dive into a single Ansible collection's plugins and use cases
tags: [collections, plugins, overview]
category: domain
triggers: [collection summary, what is collection, describe collection]
---

# Summarize Collection

Generate a detailed summary of a specific Ansible collection.

## Instructions

Use the `get_collection_plugins` MCP tool with the collection name to get all plugins in the collection, then provide:

1. A brief description of what this collection is for
2. The key modules, plugins, and roles it provides
3. Common use cases and example scenarios
4. Any dependencies or requirements

## Context

If a collection name is provided below the separator, use it directly.
Otherwise, ask the user which collection they want to learn about.

---
