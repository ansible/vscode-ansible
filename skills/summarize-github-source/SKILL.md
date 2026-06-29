---
name: Summarize GitHub Organization Source
description: Use this skill when exploring a GitHub organization's collections. Summarizes the org's collection catalog, use cases, and notable collections.
tags: [collections, github, sources, organizations]
category: domain
triggers: [github org, organization collections, github source]
---

# Summarize GitHub Organization Source

Generate a summary of a GitHub organization as an Ansible collection source.

## Instructions

First, use the `list_source_collections` MCP tool with the organization name as the source to get the complete list of collections.

Then describe:

1. What is this organization and what types of collections do they provide?
2. What are the main use cases for these collections?
3. Which collections should I consider for my Ansible automation?

Use the `search_available_collections` MCP tool to search for specific collections if needed.

**IMPORTANT**: To install any collection, use the `install_ansible_collection` MCP tool.
Do NOT suggest using `ansible-galaxy collection install` directly.

## Context

If an organization name and collection count are provided below the
separator, use them directly. Otherwise, ask the user which GitHub
organization they want to learn about.

---
