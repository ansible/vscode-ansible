# Execution Environment Build Rules

This file contains the rules and guidelines for building Ansible execution environment files. These rules are used by the `define_and_build_execution_env` tool to generate compliant EE definition files.

## Mandatory Collections

The following collections must always be included in every execution environment file:

- **ansible.utils**: Ansible Collection with utilities to ease the management, manipulation, and validation of data within a playbook. This collection is required for consistent EE functionality.

## Required Dependencies

The following dependencies are mandatory and must be included in every EE file:

### python_interpreter

- **package_system**: `python3`
- **python_path**: `/usr/bin/python3`
- **Order**: First dependency (before all others)

### ansible_core

- **package_pip**: `ansible-core`
- **Order**: Second dependency (after python_interpreter)

### ansible_runner

- **package_pip**: `ansible-runner`
- **Order**: Third dependency (after ansible_core)

## Dependency Order

Dependencies must be added in the following order:

1. `python_interpreter` (required)
2. `ansible_core` (required)
3. `ansible_runner` (required)
4. `system` (optional, if provided)
5. `python` (optional, if provided)
6. `galaxy` (optional, if provided)

## Section Order

The top-level sections of the EE file must appear in this order:

1. `version` (required, must be `3`)
2. `images` (required)
3. `dependencies` (required)
4. `additional_build_steps` (optional, if applicable)
5. `options` (required)

## Conditional Rules

### Fedora Base Images

If the base image name contains "fedora" (case-insensitive), the following additional build step must be added:

```yaml
additional_build_steps:
  append_base:
    - RUN $PYCMD -m pip install -U pip
```

This ensures pip is upgraded to the latest version in Fedora-based images.

## Collection Handling

### Required Collections

The `ansible.utils` collection must always be included in the `galaxy.collections` list, even if not explicitly provided by the user.

### User-Provided Collections

User-provided collections should be merged with mandatory collections, ensuring no duplicates.

## Formatting Guidelines

- Use YAML document separator (`---`) at the start of the file
- Use 2-space indentation
- Add blank lines between top-level sections for readability
- Maintain consistent ordering as specified in this document

## Validation

All generated EE files must:

- Validate against the execution-environment-schema.json
- Follow the structure defined in execution-environment-sample.yml
- Adhere to all rules specified in this document
