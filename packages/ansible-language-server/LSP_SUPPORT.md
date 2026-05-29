# LSP Support

This document describes the Language Server Protocol features supported by the Ansible Language Server.

## Supported Capabilities

### Text Document Synchronization

- **Method**: `textDocument/didOpen`, `textDocument/didChange`, `textDocument/didClose`
- **Sync kind**: Incremental

### Hover (`textDocument/hover`)

Provides contextual information on hover for:

| Target | Description |
|---|---|
| Module names | Module documentation from `ansible-doc` |
| Module options/suboptions | Option type, description, default, choices |
| Handler names (`notify`, `listen`) | Handler name with definition location |
| Variables (`{{ var }}`) | Variable name with definition source (`register:`, `vars:`, `vars_prompt`) |
| Variables from role `argument_specs` | Full documentation: type, description, default, choices |
| File paths (`include_tasks`, `template src`, etc.) | Resolved absolute path |
| Role names | `short_description` from `argument_specs.yml` |

### Completion (`textDocument/completion`)

- **Resolve support**: Yes (`completionItem/resolve`)

Provides completion for:

| Context | Items |
|---|---|
| Task keywords | Ansible task keywords (`name`, `when`, `loop`, `register`, etc.) |
| Module names | Available modules from `ansible-doc` |
| Module options/suboptions | Options with documentation from `ansible-doc` |
| Jinja2 variables (`{{ }}`) | `register` vars, `vars:` keys, `vars_prompt` names, `vars_files` keys |
| Role variables (inside role code) | Variables from `defaults/main.yml` + `vars/main.yml` |
| Role variables (in playbook) | Variables from `argument_specs.yml` with `defaults/main.yml` fallback |

### Go to Definition (`textDocument/definition`)

| Source | Target |
|---|---|
| Module name (task key) | Module documentation source |
| `notify` / `listen` value | Handler `name` definition (cross-file within role) |
| Variable in `{{ }}` | `register:`, `vars:` key, or `defaults/main.yml` / `vars/main.yml` (cross-file within role) |
| File path (`include_tasks`, `import_tasks`, `template src`, `copy src`, `include_vars`, `vars_files`) | Resolved target file |
| Role name (`roles:`, `include_role`, `import_role`) | Role's `tasks/main.yml` |

### Find References (`textDocument/references`)

| Symbol kind | Scope |
|---|---|
| Handler names | Cross-file within role (`tasks/**/*.yml` + `handlers/**/*.yml`) |
| Variables (`register`, `vars`, `vars_prompt`) | Cross-file within role (`tasks/**/*.yml` + `defaults/main.yml` + `vars/main.yml`) |
| Module names | Single file |
| Role names | Single file |

### Rename (`textDocument/rename`)

- **Prepare support**: Yes (`textDocument/prepareRename`)
- Not supported for: module names, file paths, role names

| Symbol kind | Scope | Details |
|---|---|---|
| Handler names | Cross-file within role | Rename matrix based on source: `notify` updates all; `name` updates `name` + `notify`; `listen` updates `listen` + `notify` |
| Variables | Cross-file within role | Renames in definitions (`register`, `vars`, defaults, vars files) and usages (Jinja2 expressions) |

### Document Symbols (`textDocument/documentSymbol`)

Provides a hierarchical outline of Ansible documents:

- Plays, blocks, tasks, handlers, roles
- Supports nested structures (blocks within blocks, etc.)

### Workspace Symbol (`workspace/symbol`)

Provides symbol search by name query (substring match, case-insensitive). Returns definitions only (not usages).

**Data sources:**

- All open documents (AST parsed in-memory)
- Role files on disk (`defaults/main.yml`, `vars/main.yml`, `handlers/**/*.yml`) when an open document is inside a role

| Symbol kind | LSP SymbolKind | containerName |
|---|---|---|
| Handler names (`handlers[].name`) | Function | Play name |
| Variables (`register: x`) | Variable | Task name |
| Variables (`vars:` keys) | Variable | Play/block name |
| Variables (`vars_prompt[].name`) | Variable | Play name |
| Variables (`set_fact` keys) | Variable | Task name |
| Variables (role `defaults/vars` top-level keys) | Variable | Role name |
| Role names (`roles:`, `include_role`, `import_role`) | Package | Play name |

Results are cached per document version (and by `mtime` for on-disk role files).

This enables tools like Serena to find symbols by name and then call `textDocument/references` on the resolved position.

**Limitations:** Only indexes roles that have at least one open file. Standalone files (`group_vars/`, `host_vars/`) are not indexed unless open.

### Semantic Tokens (`textDocument/semanticTokens/full`)

Provides semantic highlighting for Ansible-specific tokens.

### Diagnostics (push model)

Validation via `ansible-lint` (when available) with results published as `textDocument/publishDiagnostics`.

## Cross-File Navigation

When a file is located inside an Ansible role (detected by the `roles/<name>/` directory structure), several features operate across files within that role:

- **Handler references/rename**: scans `tasks/**/*.yml` + `handlers/**/*.yml`
- **Variable references/rename/definition**: scans `tasks/**/*.yml` + `defaults/main.yml` + `vars/main.yml`

Role path resolution order:

1. `./roles/<name>/` relative to the document
2. `DEFAULT_ROLES_PATH` from `ansible-config dump`
3. `~/.ansible/roles/`
4. `/etc/ansible/roles/`

## Role `argument_specs` Support

When a role has `meta/argument_specs.yml`, the server uses it to provide:

- **Completion**: role variables with type, description, default, and choices
- **Hover**: full option documentation on role variables and `short_description` on role names
- **Definition**: entry point resolution via `tasks_from` parameter (default: `main`)
