---
name: EE to Dev Container Guide
description: Guide users through converting an Ansible Execution Environment into a VS Code Dev Container for interactive development.
tags: [execution-environments, devcontainer, containers, migration]
category: domain
triggers: [EE devcontainer, devcontainer from EE, use EE for development, migrate EE]
---

# EE to Dev Container Guide

Help users set up a VS Code Dev Container from an Ansible Execution Environment
image using ansible-creator (not a hand-rolled config generator).

## Instructions

Walk the user through converting an EE image into a development environment.

### Step 1: Identify the EE image

Use `list_execution_environments` to show available EE images. If the user has
a specific image in mind, use `get_ee_details` to inspect it and check whether
`ansible-dev-tools` is already installed.

### Step 2: Check for ansible-dev-tools

Look for `ansible-dev-tools` in the Python packages list.

- If present, the EE can be used directly as the Dev Container image.
- If missing, prepare an **outer Containerfile** that layers ansible-dev-tools
  onto the EE (containers-in-containers / C-in-C friendly tooling). Write this
  file under `.devcontainer/Containerfile` (or next to the project) before or
  after scaffolding:

```dockerfile
FROM <ee-image>
USER root
RUN pip3 install --no-cache-dir ansible-dev-tools
USER 1000
```

Build and tag it (`podman build` / `docker build`), then use the tagged image
in the next step. Prefer baking `ansible-dev-tools` into
`execution-environment.yml` when the user owns the EE definition.

### Step 3: Scaffold with ansible-creator (MCP)

Use the existing creator MCP tool — do **not** invent a custom generator:

```text
ac_add_res_devc({
  "path": "<project-path>",
  "image": "<ee-or-layered-image>"
})
```

That runs `ansible-creator add resource devcontainer` and scaffolds
`.devcontainer/` with Docker and Podman variants (and Codespaces-oriented
defaults) matching ansible-creator / ansible-dev-tools patterns.

CLI equivalent:

```bash
ansible-creator add resource devcontainer <project-path> --image <ee-or-layered-image>
```

In the VS Code extension, the user can also right-click an EE in the
**Execution Environments** tree and choose **Add Dev Container**, which opens
the Creator form with `--image` prefilled.

### Step 4: Point build at the outer Containerfile (when layering)

If Step 2 created a Containerfile layer instead of a prebuilt tagged image,
edit the generated `devcontainer.json` (docker/podman variants as needed):

- Prefer `"image": "<tagged-layered-image>"` after building the outer file, **or**
- Use `"build": { "dockerfile": "Containerfile" }` when the Containerfile lives
  beside the chosen `devcontainer.json`.

Keep Podman C-in-C `runArgs` from the creator templates (fuse, SYS_ADMIN,
seccomp/apparmor unconfined, etc.) unless the user has a reason to change them.
Reference shapes live in ansible-dev-tools
(`.devcontainer/podman/devcontainer.json`) and ansible-creator's common
devcontainer resources.

### Step 5: Customize

Help the user add any needed customizations:

- Volume mounts for custom roles or ansible.cfg (prefer SSH agent forwarding
  over bind-mounting `~/.ssh`)
- Extra VS Code extensions
- Environment variables
- Network / privilege `runArgs` for nested containers

### Step 6: Open in container

Instruct the user to:

1. Install the Dev Containers extension (`ms-vscode-remote.remote-containers`)
2. Press Ctrl+Shift+P → **Dev Containers: Reopen in Container**
3. If using Podman from a GUI-launched editor, set an absolute
   `dev.containers.dockerPath` (for example `/opt/podman/bin/podman`)

### Migration from main branch

If the user mentions migrating from the previous extension's EE mode
(`ansible.executionEnvironment.*` settings), help them translate:

| Old setting | New field |
|-------------|-----------|
| `image` | `image` (or creator `--image`) |
| `containerEngine` | Automatic (or `dev.containers.dockerPath`) |
| `containerOptions` | `runArgs` |
| `volumeMounts` | `mounts` |
| `pull.policy` | Rebuild container to re-pull |

## Context

If an execution environment name or project path is provided below the
separator, use them directly. Otherwise, ask the user which EE they want
to use and where their project is.

---
