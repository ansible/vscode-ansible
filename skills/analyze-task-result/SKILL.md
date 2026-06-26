---
name: Analyze Task Result
description: Analyze an Ansible task execution result and provide actionable insights
tags: [playbooks, tasks, debugging, analysis]
category: workflow
triggers: [analyze task, task failed, task result, debug task]
---

# Analyze Task Result

Analyze an Ansible task execution result and provide insights.

## Instructions

1. Use the `get_plugin_doc` MCP tool to retrieve the documentation for the module used in the task
2. Review the module's parameters, return values, and examples
3. If a source file path is provided, read the source file to understand the task context
4. Analyze the task result:
   - If **FAILED**: Explain the likely cause and suggest fixes
   - If **CHANGED**: Confirm expected behavior or flag any concerns
   - If **OK**: Verify the task behaved as intended
5. Compare the invocation against the module's best practices
6. Suggest any improvements to the task configuration

## Context

If task execution details (name, module, host, status, args, result)
are provided below the separator, use them directly. Otherwise, ask
the user for the task details.

---
