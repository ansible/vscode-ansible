---
name: Build Ansible Task
description: Use this skill when building a new Ansible task. Interactively guides through plugin parameter selection and produces a well-formed task definition.
tags: [tasks, plugins, generation]
category: scaffold
triggers: [build task, create task, new task, task builder]
---

# Build Ansible Task

Help create an Ansible task using a specific plugin, guiding through the required and optional parameters.

## Instructions

Use the `build_ansible_task` MCP tool to accomplish this. Walk the user through parameter selection and produce a well-formed task definition.

## Context

If a plugin FQCN and type are provided below the separator, use them
directly. Otherwise, ask the user which plugin they want to build a
task for.

---
