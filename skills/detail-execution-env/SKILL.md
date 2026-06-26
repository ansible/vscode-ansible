---
name: Execution Environment Details
description: Detailed analysis of a specific Ansible Execution Environment
tags: [execution-environments, containers, details]
category: domain
triggers: [EE details, describe EE, execution environment info]
---

# Execution Environment Details

Generate a detailed summary of a specific Ansible Execution Environment.

## Instructions

Use the `get_ee_details` MCP tool with the EE name to get all information about it.

The tool returns complete details including:
- Container base OS and Ansible version
- ALL installed Python packages with versions
- ALL installed Ansible collections with versions
- System packages (if available)

Based on the tool output, provide:

1. A summary of the container image and its base OS
2. Key Python packages and what they enable
3. Notable Ansible collections included and their use cases
4. Best use cases for this execution environment

## Context

If an execution environment name is provided below the separator, use it
directly. Otherwise, ask the user which EE they want to learn about.

---
