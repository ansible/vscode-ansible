---
name: EE to Dev Container Guide
description: Guide users through converting an Ansible Execution Environment into a VS Code Dev Container for interactive development.
tags: [execution-environments, devcontainer, containers, migration]
category: domain
triggers: [EE devcontainer, devcontainer from EE, use EE for development, migrate EE]
---

# EE to Dev Container Guide

Help users set up a VS Code Dev Container from an Ansible Execution Environment image.

## Instructions

Walk the user through converting an EE image into a development environment:

### Step 1: Identify the EE image

Use `list_execution_environments` to show available EE images. If the user has
a specific image in mind, use `get_ee_details` to inspect it and check whether
`ansible-dev-tools` is already installed.

### Step 2: Check for ansible-dev-tools

Look for `ansible-dev-tools` in the Python packages list. If missing, advise
the user to layer it onto the image. Provide the Containerfile approach:

```dockerfile
FROM <ee-image>
USER root
RUN pip3 install --no-cache-dir ansible-dev-tools
USER 1000
```

### Step 3: Generate the devcontainer.json

Use the `generate_devcontainer_config` MCP tool to create the configuration:

```text
generate_devcontainer_config({
  "ee_name": "<image>",
  "output_dir": "<project-path>",
  "add_dev_tools_layer": true
})
```

Or guide the user to right-click the EE in the sidebar and select
**Generate Dev Container Config**.

### Step 4: Customize

Help the user add any needed customizations:

- Volume mounts for SSH keys, custom roles, or ansible.cfg
- Extra VS Code extensions
- Environment variables
- Network settings (runArgs)

### Step 5: Open in container

Instruct the user to:

1. Install the Dev Containers extension (ms-vscode-remote.remote-containers)
2. Press Ctrl+Shift+P → "Dev Containers: Reopen in Container"

### Migration from main branch

If the user mentions migrating from the previous extension's EE mode
(`ansible.executionEnvironment.*` settings), help them translate their
settings:

| Old setting | New devcontainer.json field |
|-------------|---------------------------|
| `image` | `image` |
| `containerEngine` | Automatic (or `dev.containers.dockerPath`) |
| `containerOptions` | `runArgs` |
| `volumeMounts` | `mounts` |
| `pull.policy` | Rebuild container to re-pull |

## Context

If an execution environment name or project path is provided below the
separator, use them directly. Otherwise, ask the user which EE they want
to use and where their project is.

---
