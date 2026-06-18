---
name: Collection Sources Overview
description: Compare Galaxy vs GitHub collection sources with guidance on source selection
tags: [collections, galaxy, github, sources]
category: domain
triggers: [collection sources, galaxy vs github, where to find collections]
---

# Collection Sources Overview

Help the user understand their configured collection sources and how to choose between them.

## Instructions

Based on the source details provided, explain:

1. What types of collections are typically found on Galaxy vs GitHub organizations?
2. How do I decide which source to use for a particular use case?
3. Are there any notable collections in the configured GitHub organizations I should know about?

Use the `search_available_collections` MCP tool to search for collections if needed.

**IMPORTANT**: To install any collection, use the `install_ansible_collection` MCP tool.
Do NOT suggest using `ansible-galaxy collection install` directly.

## Context

If source details (Galaxy count, GitHub org names and counts) are provided
below the separator, use them directly. Otherwise, use the
`list_source_collections` MCP tool to discover available sources.

---
