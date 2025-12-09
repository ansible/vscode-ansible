# Ansible Development Tools MCP Server - API Endpoint Documentation

**Version:** 0.1.0

**Protocol:** Model Context Protocol (MCP) 1.0

**Base URL:** stdio transport (no HTTP endpoint)

**Transport:** stdio

## Table of Contents

1. [API Reference Summary](#api-reference-summary)
2. [API Overview](#api-overview)
3. [Authentication and Security](#authentication-and-security)
4. [Resources](#resources)
5. [Tool Endpoints](#tool-endpoints)
6. [Error Responses](#error-responses)
7. [Data Types](#data-types)

---

## API Reference Summary

### Tools Summary

| Endpoint                          | Required Parameters   | Optional Parameters                                                                                            | Returns                          |
| --------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `zen_of_ansible`                  | -                     | -                                                                                                              | Ansible philosophy text          |
| `ansible_content_best_practices`  | -                     | -                                                                                                              | Best practices guidelines        |
| `list_available_tools`            | -                     | -                                                                                                              | Tool list                        |
| `ansible_lint`                    | `filePath` *        | `fix`                                                                                                       | Lint results                     |
| `ade_environment_info`            | -                     | -                                                                                                              | Environment info                 |
| `ade_setup_environment`           | -                     | `envName`, `pythonVersion`, `collections`, `installRequirements`, `requirementsFile`            | Setup results                    |
| `adt_check_env`                   | -                     | -                                                                                                              | Installation status              |
| `ansible_create_playbook`         | `name` *            | `path`                                                                                                      | Creation status                  |
| `ansible_create_collection`       | `name` *            | `path`                                                                                                      | Creation status                  |
| `define_and_build_execution_env`  | `baseImage`\*, `tag`\* | `destinationPath`, `collections`, `systemPackages`, `pythonPackages`, `generatedYaml`    | Prompt or file creation result   |
| `ansible_navigator`               | `userMessage` *    | `filePath`, `mode`, `environment`, `disableExecutionEnvironment`                                    | Playbook execution results or usage guide |

*Required for execution mode; optional for information mode

\* = Required parameter

### Resources Summary

| Resource       | URI                                        | Type     |
| -------------- | ------------------------------------------ | -------- |
| EE Schema      | `schema://execution-environment`           | JSON     |
| EE Sample      | `sample://execution-environment`           | YAML     |
| EE Rules       | `rules://execution-environment`            | Markdown |
| Best Practices | `guidelines://ansible-content-best-practices` | Markdown |

---

## API Overview

### Server Information

```json
{
  "name": "ansible-mcp-server",
  "version": "0.1.0",
  "protocolVersion": "1.0"
}
```

### Transport Protocol

**stdio** (standard input/output)

- No network endpoint
- Process-based communication
- Request/response over stdin/stdout

### Request Format

All requests follow the JSON-RPC 2.0 format:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "<tool_name>",
    "arguments": {
      // Tool-specific parameters
    }
  }
}
```

### Response Format

**Success Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "<response_content>"
      }
    ]
  }
}
```

**Error Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: <error_message>"
      }
    ],
    "isError": true
  }
}
```

---

## Authentication and Security

### Current Implementation

**stdio Transport:**

- **Authentication:** None required (process-based, runs in user context)
- **Authorization:** Inherits parent process permissions
- **Encryption:** Not applicable (local IPC)
- **Scope:** Limited to `WORKSPACE_ROOT` environment variable

**Security Model:**

- Server runs as child process of MCP client
- Same security context as parent process
- File operations scoped to workspace directory
- Commands executed with user's permissions
- No network exposure

**Environment Variables:**

| Variable | Purpose | Required | Default |
|----------|---------|----------|---------|
| `WORKSPACE_ROOT` | Root directory for file operations | No | `process.cwd()` |

### Security Considerations

1. **File System Access:** Server has read/write access within `WORKSPACE_ROOT`
2. **Command Execution:** Tools spawn child processes with user permissions
3. **No Sandbox:** Commands run without isolation
4. **Dependency Validation:** Tools check for required dependencies before execution
5. **Path Resolution:** All paths resolved to absolute to prevent traversal attacks

---

## Resources

The server exposes four read-only resources providing schema and reference data.

### Resource: Execution Environment Schema

**Resource Name:** `execution-environment-schema`
**URI:** `schema://execution-environment`
**MIME Type:** `application/json`

**Description:** JSON schema for validating Ansible execution environment definition files (execution-environment.yml) used with ansible-builder.

**Schema Structure:**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema",
  "$defs": {
    "v3": {
      "type": "object",
      "properties": { /* v3 schema properties */ },
      "required": ["version"]
    },
    "v1": {
      "type": "object",
      "properties": { /* v1 schema properties */ },
      "required": ["version"]
    },
    "TYPE_StringOrListOfStrings": {
      "oneOf": [
        { "type": "string" },
        { "type": "array", "items": { "type": "string" } }
      ]
    }
  },
  "oneOf": [
    { "$ref": "#/$defs/v3" },
    { "$ref": "#/$defs/v1" }
  ]
}
```

**Access:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/read",
  "params": {
    "uri": "schema://execution-environment"
  }
}
```

### Resource: Execution Environment Sample

**Resource Name:** `execution-environment-sample`
**URI:** `sample://execution-environment`
**MIME Type:** `text/yaml`

**Description:** Reference implementation of execution-environment.yml demonstrating v3 schema structure.

**Access:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/read",
  "params": {
    "uri": "sample://execution-environment"
  }
}
```

### Resource: Execution Environment Rules

**Resource Name:** `execution-environment-rules`
**URI:** `rules://execution-environment`
**MIME Type:** `text/markdown`

**Description:** Rules and guidelines for generating and validating execution environment files (ee-rules.md).

**Access:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "resources/read",
  "params": {
    "uri": "rules://execution-environment"
  }
}
```

### Resource: Ansible Content Best Practices

**Resource Name:** `ansible-content-best-practices`
**URI:** `guidelines://ansible-content-best-practices`
**MIME Type:** `text/markdown`

**Description:** Comprehensive best practices and guidelines for writing Ansible content. Provides standards, best practices, and guidelines for creating maintainable Ansible automation including formatting, naming conventions, project structure, testing strategies, and more.

**Access:**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "resources/read",
  "params": {
    "uri": "guidelines://ansible-content-best-practices"
  }
}
```

---

## Tool Endpoints

### Overview

The server provides 11 tools organized into the following categories:

#### A. Information & Documentation

- [`zen_of_ansible`](#endpoint-zen_of_ansible) - Ansible design philosophy
- [`ansible_content_best_practices`](#endpoint-ansible_content_best_practices) - Best practices guidelines
- [`list_available_tools`](#endpoint-list_available_tools) - List all available tools

#### B. Environment Tools

- [`ade_environment_info`](#endpoint-ade_environment_info) - Get environment information
- [`ade_setup_environment`](#endpoint-ade_setup_environment) - Setup development environment
- [`adt_check_env`](#endpoint-adt_check_env) - Check/install Ansible Development Tools

#### C. Project Generators

- [`ansible_create_playbook`](#endpoint-ansible_create_playbook) - Create new playbook
- [`ansible_create_collection`](#endpoint-ansible_create_collection) - Create new collection

#### D. Code Quality & Validation

- [`ansible_lint`](#endpoint-ansible_lint) - Lint Ansible playbooks
- [`define_and_build_execution_env`](#endpoint-define_and_build_execution_env) - Create execution environment definition

#### E. Playbook Execution

- [`ansible_navigator`](#endpoint-ansible_navigator) - Execute playbooks with smart features

---

### Information & Documentation

---

#### Endpoint: zen_of_ansible

**Description:** Returns 20 aphorisms describing Ansible's design philosophy.

**Method:** `tools/call`

**Parameters:** None

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "zen_of_ansible",
    "arguments": {}
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "1. Ansible is not Python.\n2. YAML sucks for coding.\n3. Playbooks are not for programming.\n..."
      }
    ]
  }
}
```

---

#### Endpoint: ansible_content_best_practices

**Description:** Returns comprehensive best practices and guidelines for writing Ansible content.

**Method:** `tools/call`

**Parameters:** None

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "ansible_content_best_practices",
    "arguments": {}
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[Complete best practices guidelines document in Markdown format]"
      }
    ]
  }
}
```

**Use Cases:**

- Get best practices for writing Ansible content
- Learn how to write a good Ansible playbook
- Understand Ansible formatting and naming conventions
- Learn Ansible project structure standards
- Reference Ansible testing strategies
- Follow Ansible development best practices

---

#### Endpoint: list_available_tools

**Description:** Returns list of all available tools with descriptions.

**Method:** `tools/call`

**Parameters:** None

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "list_available_tools",
    "arguments": {}
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Available Ansible Development Tools MCP Server tools\n\n- zen_of_ansible\n- ansible_content_best_practices\n- list_available_tools\n- ansible_lint\n..."
      }
    ]
  }
}
```

---

### Environment Tools

---

#### Endpoint: ade_environment_info

**Description:** Retrieve comprehensive environment information including Python version, Ansible tools, virtual environments, and installed collections.

**Method:** `tools/call`

**Parameters:** None (uses `WORKSPACE_ROOT` from environment)

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "ade_environment_info",
    "arguments": {}
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Environment Information\n==================================================\n\nWorkspace: /workspace\nPython: Python 3.11.5\nVirtual Environment: /workspace/venv (not active)\n\nAnsible Tools:\n  • Ansible: ansible [core 2.15.0]\n  • Ansible Lint: ansible-lint 6.14.3\n\nDevelopment Tools:\n  • ADE: Installed\n  • ADT: Installed\n\nInstalled Collections:\n  • amazon.aws 6.0.0\n  • ansible.utils 2.10.0\n  • community.general 7.0.0"
      }
    ]
  }
}
```

**Response Fields:**

- `workspacePath` - Workspace root directory
- `pythonVersion` - Python version string
- `virtualEnv` - Virtual environment path and status
- `ansibleVersion` - Ansible core version
- `ansibleLintVersion` - ansible-lint version
- `adeInstalled` - ADE installation status
- `adtInstalled` - ADT installation status
- `installedCollections` - List of installed Ansible collections

---

#### Endpoint: ade_setup_environment

**Description:** Setup complete Ansible development environment including virtual environment creation, tool installation, and dependency management.

**Method:** `tools/call`

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `envName` | string | | "venv" | Name for the virtual environment directory |
| `pythonVersion` | string | | "python3" | Python version to use (e.g., "3.11", "3.12") |
| `collections` | string[] | | [] | Array of Ansible collection names to install |
| `installRequirements` | boolean | | false | Whether to install from requirements.txt/requirements.yml |
| `requirementsFile` | string | | undefined | Path to specific requirements file |

**Request (Basic):**

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "ade_setup_environment",
    "arguments": {}
  }
}
```

**Request (With Options):**

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "tools/call",
  "params": {
    "name": "ade_setup_environment",
    "arguments": {
      "envName": "ansible-dev",
      "pythonVersion": "3.11",
      "collections": ["amazon.aws", "ansible.utils"],
      "installRequirements": true
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Checking for conflicting packages...\nNo conflicting packages detected\n\nChecking ansible-lint status...\nansible-lint is working properly\nVersion: ansible-lint 6.14.3\n\nVirtual environment created successfully\nInstalling Ansible tools in virtual environment...\nansible-lint and ansible-core installed in virtual environment\nCollections installed successfully\n\nTo activate the virtual environment, run:\n   source /workspace/ansible-dev/bin/activate\n\nTo deactivate the virtual environment, run:\n   deactivate\n\nPerforming final verification...\nFinal verification passed - ansible-lint is working in virtual environment"
      }
    ]
  }
}
```

**Setup Process:**

1. Check/install ADT (ansible-dev-tools)
2. Check for conflicting packages
3. Verify ansible-lint status
4. Create Python virtual environment
5. Install ansible-lint and ansible-core
6. Install specified collections (if provided)
7. Install requirements (if requested)
8. Perform final verification

---

#### Endpoint: adt_check_env

**Description:** Check if ADT (ansible-dev-tools) is installed and install if missing. Attempts installation via pip, falls back to pipx.

**Method:** `tools/call`

**Parameters:** None

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "method": "tools/call",
  "params": {
    "name": "adt_check_env",
    "arguments": {}
  }
}
```

**Response (Already Installed):**

```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "ADT (ansible-dev-tools) is already installed"
      }
    ]
  }
}
```

**Response (Installed Successfully):**

```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "ADT (ansible-dev-tools) installed successfully"
      }
    ]
  }
}
```

**Response (Error):**

```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Failed to install ADT. pip error: [error], pipx error: [error]"
      }
    ],
    "isError": true
  }
}
```

**Installation Methods (in order):**

1. `pip install ansible-dev-tools`
2. `pipx install ansible-dev-tools` (fallback)

---

### Project Generators

---

#### Endpoint: ansible_create_playbook

**Description:** Create new Ansible playbook using ansible-creator.

**Method:** `tools/call`

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | * | - | Name for the new playbook |
| `path` | string | | undefined | Destination directory path |

**Implementation:**
Executes: `ansible-creator init playbook --no-overwrite <name> [--path <path>]`

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "tools/call",
  "params": {
    "name": "ansible_create_playbook",
    "arguments": {
      "name": "my-playbook",
      "path": "/workspace/playbooks"
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "ansible-creator init playbook completed successfully\n\nOutput:\n[ansible-creator output]"
      }
    ]
  }
}
```

**Response (Error):**

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error creating playbook: [error message]\n"
      }
    ],
    "isError": true
  }
}
```

---

#### Endpoint: ansible_create_collection

**Description:** Create new Ansible collection using ansible-creator.

**Method:** `tools/call`

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | * | - | Name for the new collection (namespace.collection format) |
| `path` | string | | undefined | Destination directory path |

**Implementation:**
Executes: `ansible-creator init collection --no-overwrite <name> [--path <path>]`

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 11,
  "method": "tools/call",
  "params": {
    "name": "ansible_create_collection",
    "arguments": {
      "name": "acme.my_collection",
      "path": "/workspace/collections"
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 11,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "ansible-creator init collection completed successfully\n\nOutput:\n[ansible-creator output]"
      }
    ]
  }
}
```

**Response (Error):**

```json
{
  "jsonrpc": "2.0",
  "id": 11,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error creating collection: [error message]\n"
      }
    ],
    "isError": true
  }
}
```

---

### Code Quality & Validation

---

#### Endpoint: ansible_lint

**Description:** Execute ansible-lint on Ansible playbook files with optional automatic fixes.

**Method:** `tools/call`

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `filePath` | string | * | - | Absolute or relative path to the Ansible playbook file to lint |
| `fix` | boolean | | undefined | If `true`, applies automatic fixes using `ansible-lint --fix`. If `undefined`, prompts user for preference. If `false`, runs lint without fixes. |

**Request (Without Fix):**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "ansible_lint",
    "arguments": {
      "filePath": "/workspace/playbooks/deploy.yml"
    }
  }
}
```

**Request (With Fix):**

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "ansible_lint",
    "arguments": {
      "filePath": "/workspace/playbooks/deploy.yml",
      "fix": true
    }
  }
}
```

**Response (No Issues):**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Linting completed for file: /workspace/playbooks/deploy.yml\nNo issues found."
      }
    ]
  }
}
```

**Response (Issues Found):**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Linting results for file: /workspace/playbooks/deploy.yml\n\n❌ Found 2 issue(s):\n\n1. [yaml] on line 5 of /workspace/playbooks/deploy.yml\n   Message: line too long (120 > 80 characters)\n\n2. [name[missing]] on line 10 of /workspace/playbooks/deploy.yml\n   Message: All tasks should be named\n\n"
      }
    ]
  }
}
```

**Response (Error):**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: File not found: /workspace/playbooks/deploy.yml\n"
      }
    ],
    "isError": true
  }
}
```

**Automatic Fix Capabilities:**

- command-instead-of-shell
- deprecated-local-action
- fqcn (Fully Qualified Collection Names)
- jinja formatting
- key-order
- name formatting
- no-free-form
- no-jinja-when
- no-log-password
- partial-become
- yaml formatting

---

#### Endpoint: define_and_build_execution_env

**Description:** Create execution environment definition file for ansible-builder. Uses two-step process: (1) return prompt for LLM to generate YAML, (2) accept generated YAML and create file.

**Method:** `tools/call`

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `baseImage` | string | * | - | Base container image (e.g., 'quay.io/fedora/fedora-minimal:41') |
| `tag` | string | * | - | Tag/name for resulting image (e.g., 'my-ee:latest') |
| `destinationPath` | string | | WORKSPACE_ROOT | Destination directory for execution-environment.yml |
| `collections` | string[] | | [] | Ansible collection names to include |
| `systemPackages` | string[] | | [] | System packages to install |
| `pythonPackages` | string[] | | [] | Python packages to install |
| `generatedYaml` | string | | undefined | Internal: LLM-generated YAML content (for step 2) |

**Step 1 - Missing Required Parameters:**

**Request (Missing Parameters):**

```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "method": "tools/call",
  "params": {
    "name": "define_and_build_execution_env",
    "arguments": {}
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: 'baseImage' and 'tag' are required fields.\n\n**Please provide the following critical information:**\n- **baseImage**: The base container image (e.g., 'quay.io/fedora/fedora-minimal:41', 'quay.io/centos/centos:stream10')\n- **tag**: The tag/name for the resulting image (e.g., 'my-ee:latest')\n\n**Optional fields:**\n- **collections**: Array of Ansible collection names (e.g., ['amazon.aws', 'ansible.utils'])\n- **systemPackages**: Array of system packages (e.g., ['git', 'vim'])\n- **pythonPackages**: Array of Python packages (e.g., ['boto3', 'requests'])\n- **destinationPath**: Directory path for the file (defaults to workspace root)"
      }
    ],
    "isError": true
  }
}
```

**Step 1 - Prompt Generation:**

**Request (Without generatedYaml):**

```json
{
  "jsonrpc": "2.0",
  "id": 13,
  "method": "tools/call",
  "params": {
    "name": "define_and_build_execution_env",
    "arguments": {
      "baseImage": "quay.io/fedora/fedora-minimal:41",
      "tag": "my-ee:latest",
      "collections": ["amazon.aws"],
      "systemPackages": ["git"]
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 13,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "**Please generate the execution-environment.yml file using the following prompt:**\n\n```\nYou are generating an Ansible Execution Environment (EE) definition file.\n\nRULES AND GUIDELINES:\n[ee-rules.md content]\n\nSAMPLE EE FILE STRUCTURE:\n[execution-environment-sample.yml content]\n\nUSER REQUIREMENTS:\n- Base Image: quay.io/fedora/fedora-minimal:41\n- Tag: my-ee:latest\n- Collections: amazon.aws\n- System Packages: git\n\nGenerate a valid execution-environment.yml file following ALL rules...\n```\n\n**After generating the YAML, call this tool again with the 'generatedYaml' parameter containing the generated YAML content.**"
      }
    ]
  }
}
```

**Step 2 - File Creation:**

**Request (With generatedYaml):**

```json
{
  "jsonrpc": "2.0",
  "id": 14,
  "method": "tools/call",
  "params": {
    "name": "define_and_build_execution_env",
    "arguments": {
      "baseImage": "quay.io/fedora/fedora-minimal:41",
      "tag": "my-ee:latest",
      "collections": ["amazon.aws"],
      "systemPackages": ["git"],
      "generatedYaml": "version: 3\nimages:\n  base_image:\n    name: quay.io/fedora/fedora-minimal:41\ndependencies:\n  galaxy: requirements.yml\n  python: requirements.txt\n  system: bindep.txt\nadditional_build_steps:\n  prepend_base:\n    - RUN dnf install -y git\n"
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 14,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Execution environment file created successfully at /workspace/execution-environment.yml\n\nThe generated file has been validated against the execution environment schema.\n\nGenerated execution-environment.yml:\n```yaml\nversion: 3\nimages:\n  base_image:\n    name: quay.io/fedora/fedora-minimal:41\ndependencies:\n  galaxy: requirements.yml\n  python: requirements.txt\n  system: bindep.txt\nadditional_build_steps:\n  prepend_base:\n    - RUN dnf install -y git\n```\n\n**To build the execution environment image, run:**\n```bash\nansible-builder build --file /workspace/execution-environment.yml --context /workspace/context --tag my-ee:latest -vvv\n```\n\n**Note:** Before building, ensure you have:\n- ansible-builder installed (install via: pip install ansible-builder or via ADT)\n- A container runtime (podman or docker) installed and running\n- Sufficient permissions to build container images\n\n**Additional commands you might want to use:**\n- Create build context only: `ansible-builder create --file /workspace/execution-environment.yml --context /workspace/context`\n- Build with custom tag: `ansible-builder build --file /workspace/execution-environment.yml --context /workspace/context --tag your-custom-tag`\n\n**AGENT INSTRUCTIONS:**\n--Ask the user if the agent should run the command for them\n--If yes, run the build command and provide feedback\n--When the build completes summarize the image and build results\n--If the build fails, fix the issue and re-run the build"
      }
    ]
  }
}
```

**Response (Validation Warnings):**

```json
{
  "jsonrpc": "2.0",
  "id": 14,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Execution environment file created successfully at /workspace/execution-environment.yml\n\n**Schema Validation Warnings:**\n- /dependencies/galaxy should be object or string\n- /images missing required property 'base_image.name'\n\nThe file was generated but may not fully comply with the schema. Please review.\n\n[rest of response]"
      }
    ]
  }
}
```

**Validation Process:**

1. Parse LLM-generated YAML
2. Validate against execution-environment JSON schema
3. Check for mandatory collections
4. Verify proper structure
5. Report validation errors as warnings

---

### Playbook Execution

---

#### Endpoint: ansible_navigator

**Description:** Execute Ansible playbooks using ansible-navigator with smart features including auto-detection, container engine handling, and environment management. Supports two modes: information mode (returns usage guide) and execution mode (runs playbooks).

**Method:** `tools/call`

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `userMessage` | string | * | - | The user's original message/prompt for playbook execution. Tool parses it to extract playbook filename. |
| `filePath` | string | | undefined | Advanced: Direct file path to playbook (takes precedence over userMessage parsing) |
| `mode` | string | | "stdout" | Output mode: 'stdout' (direct terminal output) or 'interactive' (TUI for exploration) |
| `environment` | string | | "auto" | Environment selection: 'auto' (check PATH then venv), 'system' (only PATH), 'venv' (only virtual env), or specific venv name/path |
| `disableExecutionEnvironment` | boolean | | false | Set to `true` to disable execution environments (passes --ee false). Use if encountering Podman/Docker errors. |

*Required for execution mode; can be empty `{}` for information mode.

**Two Modes of Operation:**

**1. INFORMATION MODE** (call with `{}`)

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 15,
  "method": "tools/call",
  "params": {
    "name": "ansible_navigator",
    "arguments": {}
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 15,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "# Ansible Navigator - Features & Usage Guide\n\n## Output Modes\n- **stdout** (used by this tool) - Direct terminal output\n- **interactive** - Text-based UI for exploring execution\n\n## Execution Environments\n- **VM/Podman** (default) - Runs in isolated container\n- **Local Ansible** (with --ee false) - Uses local installation\n..."
      }
    ]
  }
}
```

**2. EXECUTION MODE** (call with `userMessage`)

**Request (Basic):**

```json
{
  "jsonrpc": "2.0",
  "id": 16,
  "method": "tools/call",
  "params": {
    "name": "ansible_navigator",
    "arguments": {
      "userMessage": "run play1.yml"
    }
  }
}
```

**Request (With Options):**

```json
{
  "jsonrpc": "2.0",
  "id": 17,
  "method": "tools/call",
  "params": {
    "name": "ansible_navigator",
    "arguments": {
      "userMessage": "run playbooks/deploy.yml",
      "mode": "stdout",
      "environment": "auto",
      "disableExecutionEnvironment": false
    }
  }
}
```

**Response (Success):**

```json
{
  "jsonrpc": "2.0",
  "id": 16,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "ansible-navigator run completed for file: /workspace/playbooks/play1.yml:\n\n**Playbook executed successfully!**\n\n**Configuration Used:**\n- **Output Mode:** stdout (default - shows full output)\n- **Environment:** auto (auto-detected) → /workspace/venv\n- **Execution Environment:** disabled (using local Ansible)\n\n**What This Means:**\n- Detected virtual environment, so execution environment was automatically disabled\n- Using your local Ansible installation from the venv\n\n**Want to customize? Just ask me to:**\n- \"Run with minimal output\" → Uses stdout-minimal mode\n- \"Run in interactive mode\" → Uses interactive TUI\n- \"Use venv\" → Forces virtual environment\n- \"Use system ansible\" → Forces system PATH\n- \"Disable execution environment\" → Uses local Ansible (no Podman)\n\nOutput:\n[ansible-navigator output]"
      }
    ]
  }
}
```

**Response (Error - File Not Found):**

```json
{
  "jsonrpc": "2.0",
  "id": 16,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: File not found or not accessible: /workspace/play1.yml. ..."
      }
    ],
    "isError": true
  }
}
```

**Response (Error - ansible-navigator Not Available):**

```json
{
  "jsonrpc": "2.0",
  "id": 16,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "ansible-navigator is not available in PATH or virtual environments.\n\nPATH: /usr/local/bin:/usr/bin:/bin\n\nChecked virtual environments in: /workspace\nCommon venv names checked: ansible-dev, venv, .venv, virtualenv, .virtualenv, env, .env\n\nPlease install ansible-navigator:\n  pip install ansible-navigator\n\nOr ensure it's installed and accessible in your PATH or a virtual environment."
      }
    ],
    "isError": true
  }
}
```

**Response (Error - Container Engine Issue):**

```json
{
  "jsonrpc": "2.0",
  "id": 16,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "ansible-navigator exited with code 1: Container engine issue detected.\n\nError output:\nCannot connect to Podman. Is Podman VM running?\n\n**Issue:** Podman VM not running.\n\n**Note:** Tool will auto-retry with local Ansible (execution environment disabled).\n\n**To use Podman:** Run `podman machine start`"
      }
    ],
    "isError": true
  }
}
```

**Smart Features:**

- Auto-detects playbook files from user's message
- Handles Podman/Docker errors automatically (retries with --ee false)
- Environment auto-detection (PATH, venv, system)
- Clean, formatted output with configuration details
- Explains what happened and how to customize settings

**Security:**

- Validates file path is within workspace (prevents directory traversal)
- Checks file exists and is a regular file (not directory)
- Whitelisted mode values ("stdout", "interactive")
- Hardcoded engine checks (podman, docker) to prevent command injection
- Process timeout: 5 minutes
- Output size limit: 10MB

---

## Error Responses

### Error Format

All errors use consistent format:

```json
{
  "jsonrpc": "2.0",
  "id": <number>,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: <error_message>\n[additional context]"
      }
    ],
    "isError": true
  }
}
```

### Error Types

#### 1. Tool Not Found

**Error Code:** ErrorCode.MethodNotFound (MCP)

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32601,
    "message": "Tool 'invalid_tool' not found. Available tools: zen_of_ansible, ansible_content_best_practices, list_available_tools, ansible_lint, ..."
  }
}
```

**Cause:** Invalid tool name in request

**Resolution:** Use `list_available_tools` to get valid tool names

#### 2. Missing Dependencies

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "❌ Cannot use tool 'ansible_lint' because required dependencies are missing:\n\n  - ansible-lint (Ansible playbook linter)\n    Install: pip install ansible-lint\n\nPlease install or update the dependencies and try again."
      }
    ],
    "isError": true
  }
}
```

**Cause:** Required system dependency not installed

**Resolution:** Install missing dependency using provided command

#### 3. Version Mismatch

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "❌ Cannot use tool 'ansible_lint' because version requirements are not met:\n\n  - ansible-lint (Ansible playbook linter)\n    Current version: 5.4.0\n    Required version: 6.0.0 or higher\n    Update: pip install ansible-lint\n\nPlease install or update the dependencies and try again."
      }
    ],
    "isError": true
  }
}
```

**Cause:** Installed dependency version below minimum required

**Resolution:** Update dependency to required version

#### 4. File Not Found

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: File not found: /path/to/file.yml"
      }
    ],
    "isError": true
  }
}
```

**Cause:** Specified file path does not exist

**Resolution:** Verify file path and ensure file exists

#### 5. Invalid Arguments

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: 'baseImage' and 'tag' are required fields.\n\n**Please provide the following critical information:**\n- **baseImage**: The base container image\n- **tag**: The tag/name for the resulting image"
      }
    ],
    "isError": true
  }
}
```

**Cause:** Required parameters missing from request

**Resolution:** Provide all required parameters

#### 6. Command Execution Failure

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: Failed to start ansible-lint process. Is it installed and in your PATH? Details: [error details]"
      }
    ],
    "isError": true
  }
}
```

**Cause:** Command failed to execute (not in PATH, permissions, etc.)

**Resolution:** Verify command is installed and accessible

#### 7. Parse Error

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: Failed to parse JSON output from ansible-lint. Raw output: [output]"
      }
    ],
    "isError": true
  }
}
```

**Cause:** Command output could not be parsed

**Resolution:** Check command output format, may indicate command error

---

## Data Types

### Common Types

#### ADEEnvironmentInfo

```typescript
{
  virtualEnv: string | null;          // Virtual environment path or status
  pythonVersion: string;              // Python version string
  ansibleVersion: string | null;      // Ansible version or null if not installed
  ansibleLintVersion: string | null;  // ansible-lint version or null
  installedCollections: string[];     // Array of installed collection names
  workspacePath: string;              // Workspace root directory
  adeInstalled: boolean;              // ADE installation status
  adtInstalled: boolean;              // ADT installation status
}
```

#### ADECommandResult

```typescript
{
  success: boolean;     // Operation success status
  output: string;       // Command stdout/success message
  error?: string;       // Error message if failed
  exitCode?: number;    // Process exit code
}
```

#### ExecutionEnvResult

```typescript
{
  success: boolean;            // File creation success
  filePath: string;            // Path to created file
  yamlContent: string;         // Generated YAML content
  message: string;             // Success/status message
  buildCommand: string;        // ansible-builder command
  validationErrors?: string[]; // Schema validation errors (warnings)
}
```

#### Dependency

```typescript
{
  name: string;                              // Human-readable name
  command: string;                           // Command to check if installed
  installCommand: string;                    // Installation command/instructions
  description?: string;                      // Optional description
  minVersion?: string;                       // Minimum required version (e.g., "2.9.0")
  versionCommand?: string;                   // Command to get version
  versionParser?: (output: string) => string | null;  // Parse version from output
}
```

### Common Dependencies

#### ansible

- **Command:** `ansible`
- **Min Version:** 2.9.0
- **Install:** `pip install ansible`
- **Version Check:** `ansible --version`

#### ansible-lint

- **Command:** `ansible-lint`
- **Min Version:** 6.0.0
- **Install:** `pip install ansible-lint`
- **Version Check:** `ansible-lint --version --offline`

#### ansible-creator

- **Command:** `ansible-creator`
- **Min Version:** 25.9.1
- **Install:** `pip install ansible-creator`
- **Version Check:** `ansible-creator --version`

#### ansible-navigator

- **Command:** `ansible-navigator`
- **Min Version:** None specified
- **Install:** `pip install ansible-navigator`
- **Version Check:** `ansible-navigator --version`

#### python3

- **Command:** `python3`
- **Min Version:** 3.8.0
- **Install:** <https://www.python.org/downloads/>
- **Version Check:** `python3 --version`

---

**API Version:** 0.1.0
**Last Updated:** 2025-11-19
**Protocol:** MCP 1.0
**Reference:** <https://code.visualstudio.com/api/extension-guides/ai/mcp>
