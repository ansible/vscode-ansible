---
name: Summarize Installed Collections
description: List and categorize all installed Ansible collections in the workspace
tags: [collections, inventory, overview]
category: domain
triggers: [list collections, installed collections, collection summary]
---

# Summarize Installed Collections

Generate a summary of all installed Ansible collections in the workspace.

## Instructions

Use the `list_ansible_collections` MCP tool to get the list of installed collections, then provide:

1. A brief overview of the collection categories (networking, cloud, system, etc.)
2. Key capabilities provided by these collections
3. Any recommendations for commonly paired collections that might be missing

After your summary, ask the user if they would like to search for additional collections. If they say yes, use the `search_available_collections` MCP tool to find relevant collections based on their use case (you can filter by source: "galaxy" or a GitHub org name).

**IMPORTANT**: To install any collection, use the `install_ansible_collection` MCP tool.
Do NOT suggest using `ansible-galaxy collection install` directly.

## Context

No additional context is required for this skill. If the user specifies
a particular focus area, tailor the summary accordingly.

---
