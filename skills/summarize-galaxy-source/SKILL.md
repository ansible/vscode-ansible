---
name: Summarize Galaxy Source
description: Describe Ansible Galaxy as a collection source with popular collections and search guidance
tags: [collections, galaxy, sources]
category: domain
triggers: [galaxy source, what is galaxy, galaxy collections]
---

# Summarize Galaxy Source

Generate a summary of Ansible Galaxy as a collection source.

## Instructions

Describe:

1. What is Ansible Galaxy and what types of collections are typically found there?
2. How do I search for and evaluate collections on Galaxy?
3. What are some of the most popular/useful collections on Galaxy?

Use the `list_source_collections` MCP tool with source: "galaxy" to see the most popular collections.
Use the `search_available_collections` MCP tool to search for specific collections.

**IMPORTANT**: To install any collection, use the `install_ansible_collection` MCP tool.
Do NOT suggest using `ansible-galaxy collection install` directly.

## Context

If a Galaxy collection count is provided below the separator, include it
in your summary. Otherwise, use the MCP tools to discover the information.

---
