---
name: Explain Ansible Plugin
description: Use this skill when you want to understand what a plugin does. Explains an Ansible plugin with practical examples, key parameters, and best practices.
tags: [collections, plugins, documentation]
category: domain
triggers: [explain plugin, plugin docs, what does plugin do]
---

# Explain Ansible Plugin

Explain the specified Ansible plugin in practical terms.

## Instructions

Use the appropriate MCP tool to retrieve the full plugin documentation:

- For **installed** plugins: `get_plugin_documentation`
- For **Galaxy** plugins (not installed): `get_galaxy_plugin_doc`
- For **SCM/GitHub** plugins: `get_scm_plugin_doc`

Then provide:

1. What this plugin does in plain language
2. The most important parameters and when to use them
3. A practical example task showing common usage
4. Any gotchas or best practices

## Context

If plugin details are provided below the separator, use them directly.
Otherwise, ask the user which plugin they want to learn about.

---
