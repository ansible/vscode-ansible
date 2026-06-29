---
name: Summarize Playbook
description: Use this skill when you need to understand what a playbook does. Analyzes structure, roles, tasks, and audits collection dependencies.
tags: [playbooks, analysis, collections, audit]
category: workflow
triggers: [playbook summary, analyze playbook, what does playbook do]
---

# Summarize Playbook

Analyze an Ansible playbook and provide a comprehensive summary.

## Instructions

1. Read the playbook file
2. Follow all imports (import_playbook, include_playbook)
3. Examine all roles used (check roles/ directory and requirements.yml)
4. List all tasks in order of execution
5. Identify any variables, handlers, and templates used
6. **Catalog all collections and plugins used** — note every fully-qualified collection name (FQCN) referenced in the playbook (e.g., ansible.builtin.copy, community.general.ufw)

## Required Output (in this order)

### Executive Summary

Provide a 1-2 paragraph summary explaining what this playbook accomplishes at a high level. Describe the purpose, the systems it targets, and the end result after successful execution. Write this for someone who needs to quickly understand what running this playbook will do.

### Hierarchical Structure

Show the full playbook structure including plays, pre-tasks, roles, tasks, handlers, and post-tasks.

### Collections Used

List all collections referenced in the playbook with their FQCNs.

### Other Dependencies

Note any additional external dependencies (Galaxy roles, required variables, inventory requirements, etc.)

## Final Step: Collection Audit (Do this LAST)

**Important: Complete all sections above before this step.**

1. Use the `list_collections` MCP tool to check which collections are currently installed
2. Compare the installed collections against those required by the playbook
3. Note any version requirements from collections/requirements.yml if present
4. **End your response by asking the user** if they would like to install any missing collections using the `install_collection` MCP tool

## Context

If a playbook path and name are provided below the separator, use them
directly. Otherwise, ask the user which playbook they want to analyze.

---
