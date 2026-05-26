# ADR-003: Execution Environment Support via Dev Containers

## Status

Proposed

## Date

2026-05-26

## Context

The `main` extension provides a "run inside EE" mode via seven
`ansible.executionEnvironment.*` configuration properties. When enabled,
all Ansible tooling (ansible-lint, ansible-playbook, ansible-doc, etc.)
is executed inside a container using podman or docker. The extension
manages container lifecycle, volume mounts, pull policies, and engine
selection internally.

This approach has several problems:

- **Duplicated container orchestration**: The extension reimplements
  container exec, volume mounting, and engine detection — capabilities
  already handled by VS Code's Dev Containers extension and the
  devcontainer spec.
- **Fragile runtime**: Subprocess calls routed through `docker exec`
  or `podman exec` are brittle. Argument escaping, TTY handling, and
  signal propagation differ between engines and versions.
- **Incomplete developer experience**: Running inside an EE provides
  Ansible tooling but not a full development environment. The user
  still edits files on the host, with no access to the EE's Python
  environment for debugging, testing, or ad-hoc scripting.
- **Maintenance burden**: Seven config properties, engine auto-detection
  logic, volume mount wiring, and pull policy handling represent
  significant surface area to maintain and test.

Meanwhile, the devcontainer ecosystem solves this problem at a platform
level. A user can add an `ansible-dev-tools` layer to any EE image and
open the workspace in a dev container, getting the full development
experience — editor, terminal, tooling, and extensions — all running
inside the container.

## Decision

**We will not reimplement the "run inside EE" mode. Instead, we will
provide documentation and tooling to help users add a dev-tools layer
to their EE images and use VS Code Dev Containers (or GitHub Codespaces)
for EE-based development.**

Concretely:

1. The `ansible.executionEnvironment.*` configuration block will not be
   ported to the `next` branch.
2. The EE tree view retains its inspection capability (listing images,
   showing installed collections and packages).
3. Documentation and/or a Creator form will guide users through adding
   an `ansible-dev-tools` layer to an existing EE definition and
   generating a `.devcontainer/devcontainer.json` that uses the image.

## Alternatives Considered

### Alternative 1: Port the EE mode from main

**Description**: Reimplement the seven config properties and container
exec routing in the `next` architecture.

**Pros**:
- Feature parity with `main`
- No user workflow change

**Cons**:
- Reimplements what devcontainers already solve
- Ongoing maintenance of container engine abstraction
- Fragile subprocess-through-container execution

**Why not chosen**: The devcontainer approach provides a superior
developer experience with less custom code.

### Alternative 2: Drop EE support entirely

**Description**: Remove the EE tree view and provide no EE integration.

**Pros**:
- Simplest implementation

**Cons**:
- Loses the ability to inspect EE images
- No migration path for existing EE users

**Why not chosen**: The inspection tree view is valuable and
low-maintenance. Users need to see what's inside their EEs.

## Consequences

### Positive

- Eliminates ~7 config properties and associated container exec logic
- Users get a full dev environment inside the EE, not just routed
  tooling
- Leverages the mature devcontainer ecosystem and its VS Code
  integration
- Simpler extension architecture with less surface area

### Negative

- Users currently relying on EE mode need to migrate to devcontainers
- Requires documentation effort to guide the migration
- Dev Containers extension becomes a soft dependency for EE workflows

### Neutral

- The EE tree view continues to list and inspect images regardless
- `ansible-builder build` command (gap #3) remains relevant for
  building EE images

## Related Decisions

- [ADR-001](ADR-001-service-based-architecture.md): Service-based
  architecture — EE inspection uses `ExecutionEnvService` in
  `@ansible/core`

---

## Revision History

| Date | Author | Change |
|------|--------|--------|
| 2026-05-26 | AI-assisted | Initial proposal |
