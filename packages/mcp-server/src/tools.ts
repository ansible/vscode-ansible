/**
 * MCP Tool Definitions
 *
 * These define the tools available to AI agents via the MCP protocol.
 */

export interface McpToolAnnotations {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
}

export interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
    annotations?: McpToolAnnotations;
}

export type McpErrorCode =
    'MISSING_PARAM' | 'INVALID_INPUT' | 'NOT_FOUND' | 'SERVICE_UNAVAILABLE' | 'OPERATION_FAILED';

export type McpRecoverability = 'retry' | 'escalate' | 'fail';

export interface McpErrorDetail {
    code: McpErrorCode;
    recoverability: McpRecoverability;
    message: string;
    suggestion?: string;
}

export interface McpToolResult {
    content: { type: 'text'; text: string }[];
    isError?: boolean;
}

/**
 * Builds a structured, machine-readable MCP error response.
 * @param detail - Error metadata including code, recoverability, and message
 * @returns MCP tool result with `isError: true` and JSON-serialized detail
 */
export function mcpError(detail: McpErrorDetail): McpToolResult {
    return {
        content: [{ type: 'text', text: JSON.stringify(detail) }],
        isError: true,
    };
}

export const READ_ONLY: McpToolAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
};

export const DESTRUCTIVE: McpToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
};

// === Discovery Tools ===

export const SEARCH_PLUGINS_TOOL: McpToolDefinition = {
    name: 'search_ansible_plugins',
    description: `Search for Ansible plugins by keyword.

Returns matching plugins with names, types, and short descriptions.
Use this to find the right plugin before generating tasks.

Examples:
- "copy file" → ansible.builtin.copy
- "cisco vlan" → cisco.nxos.nxos_vlans, cisco.ios.ios_vlans
- "docker container" → community.docker.docker_container
- "aws ec2" → amazon.aws.ec2_instance`,
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Search terms (e.g., "copy file", "network acl", "kubernetes pod")',
            },
            plugin_type: {
                type: 'string',
                enum: ['module', 'filter', 'lookup', 'callback', 'connection', 'inventory'],
                description: 'Optional: filter by plugin type',
            },
            collection: {
                type: 'string',
                description:
                    'Optional: filter by collection (e.g., "cisco.nxos", "ansible.builtin")',
            },
            limit: {
                type: 'number',
                description: 'Maximum results (default: 15, max: 50)',
            },
        },
        required: ['query'],
    },
};

export const GET_PLUGIN_DOC_TOOL: McpToolDefinition = {
    name: 'get_plugin_documentation',
    description: `Get full documentation for a specific Ansible plugin.

Returns synopsis, all parameters with types/defaults/choices, examples, and return values.
Use search_ansible_plugins first if you need to find the plugin name.`,
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {
            plugin: {
                type: 'string',
                description:
                    'Full plugin name (e.g., "ansible.builtin.copy", "cisco.nxos.nxos_vlans")',
            },
            plugin_type: {
                type: 'string',
                enum: [
                    'module',
                    'filter',
                    'lookup',
                    'callback',
                    'connection',
                    'inventory',
                    'become',
                    'cache',
                    'cliconf',
                    'httpapi',
                    'netconf',
                    'shell',
                    'strategy',
                    'test',
                    'vars',
                ],
                description: 'Plugin type (default: module)',
            },
        },
        required: ['plugin'],
    },
};

export const LIST_COLLECTIONS_TOOL: McpToolDefinition = {
    name: 'list_ansible_collections',
    description: 'List all installed Ansible collections with their versions.',
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {
            filter: {
                type: 'string',
                description: 'Optional: filter by namespace or name',
            },
        },
    },
};

export const INSTALL_COLLECTION_TOOL: McpToolDefinition = {
    name: 'install_ansible_collection',
    description: `Install an Ansible collection using ade (ansible-dev-tools).

Examples:
- install_ansible_collection({ name: "hetzner.hcloud" })
- install_ansible_collection({ name: "cisco.nxos" })`,
    annotations: DESTRUCTIVE,
    inputSchema: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'Collection name (e.g., "hetzner.hcloud", "cisco.nxos")',
            },
        },
        required: ['name'],
    },
};

export const SEARCH_AVAILABLE_COLLECTIONS_TOOL: McpToolDefinition = {
    name: 'search_available_collections',
    description: `Search for available Ansible collections by keyword across all configured sources.

Searches Ansible Galaxy (~4000+ collections) and configured GitHub organizations to find relevant collections.
Use this to discover collections for specific use cases before installing them.

Examples:
- search_available_collections({ query: "kubernetes" }) → finds k8s-related collections from all sources
- search_available_collections({ query: "cisco", source: "galaxy" }) → finds Cisco collections from Galaxy only
- search_available_collections({ query: "aap", source: "redhat-cop" }) → finds AAP collections from redhat-cop GitHub org`,
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Search terms (e.g., "kubernetes", "cisco", "aws", "vmware")',
            },
            source: {
                type: 'string',
                description:
                    'Optional: limit to a specific source ("galaxy" or a GitHub org name like "redhat-cop")',
            },
            limit: {
                type: 'number',
                description: 'Maximum results (default: 20, max: 100)',
            },
        },
        required: ['query'],
    },
};

export const LIST_SOURCE_COLLECTIONS_TOOL: McpToolDefinition = {
    name: 'list_source_collections',
    description: `List all collections from a specific source (Galaxy or GitHub org).

Use this to get a complete list of collections from a source before summarizing.

Examples:
- list_source_collections({ source: "galaxy" }) → all Galaxy collections
- list_source_collections({ source: "redhat-cop" }) → all collections from redhat-cop GitHub org
- list_source_collections({ source: "ansible-collections" }) → all collections from ansible-collections GitHub org`,
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {
            source: {
                type: 'string',
                description: 'Source to list: "galaxy" or a GitHub org name',
            },
            limit: {
                type: 'number',
                description: 'Maximum results (default: 100, max: 500)',
            },
        },
        required: ['source'],
    },
};

export const GET_COLLECTION_PLUGINS_TOOL: McpToolDefinition = {
    name: 'get_collection_plugins',
    description: `List all plugins in a specific Ansible collection.

Returns plugins grouped by type (modules, filters, lookups, etc.) with descriptions.

Examples:
- get_collection_plugins({ collection: "cisco.nxos" })
- get_collection_plugins({ collection: "ansible.builtin", plugin_type: "module" })`,
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {
            collection: {
                type: 'string',
                description: 'Collection name (e.g., "cisco.nxos", "ansible.builtin")',
            },
            plugin_type: {
                type: 'string',
                enum: [
                    'module',
                    'filter',
                    'lookup',
                    'callback',
                    'connection',
                    'inventory',
                    'become',
                    'cache',
                    'cliconf',
                    'httpapi',
                    'netconf',
                    'shell',
                    'strategy',
                    'test',
                    'vars',
                ],
                description: 'Optional: filter by plugin type',
            },
        },
        required: ['collection'],
    },
};

export const GET_GALAXY_PLUGIN_DOC_TOOL: McpToolDefinition = {
    name: 'get_galaxy_plugin_doc',
    description: `Get documentation for a plugin from an uninstalled Galaxy collection.

Fetches the docs-blob from Ansible Galaxy and returns full plugin documentation
including synopsis, parameters, examples, and return values.

Use search_available_collections first to find the collection, then this tool
to read its plugin docs without installing it.

Examples:
- get_galaxy_plugin_doc({ collection: "cisco.ios", plugin: "ios_acls", plugin_type: "module" })
- get_galaxy_plugin_doc({ collection: "community.docker" }) → lists all plugin types and counts`,
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {
            collection: {
                type: 'string',
                description: 'Collection FQCN (e.g., "cisco.ios", "community.general")',
            },
            plugin: {
                type: 'string',
                description:
                    'Plugin short name (e.g., "ios_acls"). Omit to list available plugin types.',
            },
            plugin_type: {
                type: 'string',
                enum: [
                    'module',
                    'filter',
                    'lookup',
                    'callback',
                    'connection',
                    'inventory',
                    'become',
                    'cache',
                    'cliconf',
                    'httpapi',
                    'netconf',
                    'shell',
                    'strategy',
                    'test',
                    'vars',
                ],
                description: 'Plugin type (default: module)',
            },
        },
        required: ['collection'],
    },
};

export const GET_SCM_PLUGIN_DOC_TOOL: McpToolDefinition = {
    name: 'get_scm_plugin_doc',
    description: `Get documentation for a plugin from a GitHub-hosted collection.

Shallow-clones the repository and runs ansible-doc to extract full plugin
documentation including synopsis, parameters, examples, and return values.
Results are cached for 7 days.

Requires the collection to be in a configured GitHub organization.

Examples:
- get_scm_plugin_doc({ org: "redhat-cop", repo: "infra.aap_configuration", collection: "infra.aap_configuration", plugin: "credential_type", plugin_type: "module" })
- get_scm_plugin_doc({ org: "redhat-cop", repo: "infra.aap_configuration", collection: "infra.aap_configuration" }) → lists all plugin types and counts`,
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {
            org: {
                type: 'string',
                description: 'GitHub organization (e.g., "redhat-cop")',
            },
            repo: {
                type: 'string',
                description: 'GitHub repository name (e.g., "infra.aap_configuration")',
            },
            collection: {
                type: 'string',
                description: 'Collection FQCN (e.g., "infra.aap_configuration")',
            },
            plugin: {
                type: 'string',
                description:
                    'Plugin short name (e.g., "credential_type"). Omit to list available plugin types.',
            },
            plugin_type: {
                type: 'string',
                enum: [
                    'module',
                    'filter',
                    'lookup',
                    'callback',
                    'connection',
                    'inventory',
                    'become',
                    'cache',
                    'cliconf',
                    'httpapi',
                    'netconf',
                    'shell',
                    'strategy',
                    'test',
                    'vars',
                ],
                description: 'Plugin type (default: module)',
            },
            force_refresh: {
                type: 'boolean',
                description:
                    'Set to true to invalidate the cached docs and re-clone the repository. Use when the collection has been updated.',
            },
        },
        required: ['org', 'repo', 'collection'],
    },
};

// === Task Generation Tools ===

export const GENERATE_TASK_TOOL: McpToolDefinition = {
    name: 'generate_ansible_task',
    description: `Generate an Ansible task YAML for any installed plugin (one-shot).

Dynamically fetches the plugin's schema and generates properly formatted YAML.
Use this when you know the plugin and parameters needed.

Examples:
• Copy file:
  generate_ansible_task({
    plugin: "ansible.builtin.copy",
    params: { src: "app.conf", dest: "/etc/app/", mode: "0644" }
  })

• Install package:
  generate_ansible_task({
    plugin: "ansible.builtin.apt",
    params: { name: "nginx", state: "present" },
    become: true
  })

• Configure network:
  generate_ansible_task({
    plugin: "cisco.nxos.nxos_vlans",
    params: { config: [{ vlan_id: 100, name: "Web" }], state: "merged" }
  })`,
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {
            plugin: {
                type: 'string',
                description: 'Full plugin name (e.g., "ansible.builtin.copy")',
            },
            plugin_type: {
                type: 'string',
                enum: [
                    'module',
                    'filter',
                    'lookup',
                    'callback',
                    'connection',
                    'inventory',
                    'become',
                    'cache',
                    'cliconf',
                    'httpapi',
                    'netconf',
                    'shell',
                    'strategy',
                    'test',
                    'vars',
                ],
                description: 'Plugin type (default: module)',
            },
            params: {
                type: 'object',
                additionalProperties: true,
                description: 'Plugin parameters as key-value pairs',
            },
            task_name: {
                type: 'string',
                description: 'Custom task name (auto-generated if not provided)',
            },
            register: {
                type: 'string',
                description: 'Variable name to store task result',
            },
            when: {
                type: 'string',
                description: 'Conditional expression (e.g., "ansible_os_family == \'Debian\'")',
            },
            loop: {
                type: 'array',
                items: { type: 'string' },
                description: 'Items to iterate over',
            },
            become: {
                type: 'boolean',
                description: 'Run with elevated privileges (sudo)',
            },
            ignore_errors: {
                type: 'boolean',
                description: 'Continue playbook on task failure',
            },
            tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags to apply to the task',
            },
        },
        required: ['plugin', 'params'],
    },
};

export const BUILD_TASK_TOOL: McpToolDefinition = {
    name: 'build_ansible_task',
    description: `Interactively build an Ansible task with guided parameter collection.

This tool maintains conversation state and guides through:
1. Required parameters (must be provided)
2. Optional parameters (can be added)
3. Final YAML generation

**Start a new session:**
build_ansible_task({ plugin: "ansible.builtin.copy" })
→ Returns list of required/optional parameters with descriptions

**Add parameters:**
build_ansible_task({ session_id: "xxx", params: { src: "file.txt", dest: "/tmp/" }})
→ Updates state, shows what's still needed

**Generate when ready:**
build_ansible_task({ session_id: "xxx", generate: true })
→ Returns final YAML

Sessions timeout after 10 minutes of inactivity.`,
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {
            plugin: {
                type: 'string',
                description: 'Start new session: Full plugin name',
            },
            plugin_type: {
                type: 'string',
                enum: [
                    'module',
                    'filter',
                    'lookup',
                    'callback',
                    'connection',
                    'inventory',
                    'become',
                    'cache',
                    'cliconf',
                    'httpapi',
                    'netconf',
                    'shell',
                    'strategy',
                    'test',
                    'vars',
                ],
                description: 'Plugin type (default: module)',
            },
            session_id: {
                type: 'string',
                description: 'Continue existing session',
            },
            params: {
                type: 'object',
                additionalProperties: true,
                description: 'Parameters to add to the task',
            },
            task_name: {
                type: 'string',
                description: 'Custom task name',
            },
            become: {
                type: 'boolean',
                description: 'Run with elevated privileges',
            },
            register: {
                type: 'string',
                description: 'Variable to store result',
            },
            when: {
                type: 'string',
                description: 'Conditional expression',
            },
            generate: {
                type: 'boolean',
                description: 'Generate YAML with current parameters',
            },
            cancel: {
                type: 'boolean',
                description: 'Cancel the session',
            },
        },
    },
};

export const GENERATE_PLAYBOOK_TOOL: McpToolDefinition = {
    name: 'generate_ansible_playbook',
    description: `Generate a complete Ansible playbook with multiple tasks.

Provide a list of tasks and this tool generates a properly formatted playbook.`,
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'Playbook name/description',
            },
            hosts: {
                type: 'string',
                description: 'Target hosts or group (e.g., "all", "webservers", "localhost")',
            },
            tasks: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        plugin: { type: 'string' },
                        params: { type: 'object', additionalProperties: true },
                        task_name: { type: 'string' },
                        become: { type: 'boolean' },
                        when: { type: 'string' },
                        register: { type: 'string' },
                    },
                    required: ['plugin', 'params'],
                },
                description: 'List of tasks to include',
            },
            become: {
                type: 'boolean',
                description: 'Run all tasks with elevated privileges',
            },
            vars: {
                type: 'object',
                description: 'Playbook variables',
            },
            gather_facts: {
                type: 'boolean',
                description: 'Gather facts before running (default: true)',
            },
        },
        required: ['name', 'hosts', 'tasks'],
    },
};

// === Execution Environment Tools ===

export const LIST_EE_TOOL: McpToolDefinition = {
    name: 'list_execution_environments',
    description: 'List available Ansible execution environment container images.',
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {},
    },
};

export const GET_EE_DETAILS_TOOL: McpToolDefinition = {
    name: 'get_ee_details',
    description: `Get COMPLETE detailed information about an Ansible execution environment.

This tool returns ALL information about the EE - no additional container inspection is needed:
• Container base OS and Ansible version
• ALL installed Ansible collections with versions
• ALL installed Python packages with versions
• ALL system packages (if available)

Use the ee_name exactly as returned by list_execution_environments.`,
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {
            ee_name: {
                type: 'string',
                description:
                    'Execution environment image name (e.g., "quay.io/ansible/creator-ee:latest")',
            },
        },
        required: ['ee_name'],
    },
};

export const BUILD_EE_TOOL: McpToolDefinition = {
    name: 'build_execution_environment',
    description: `Build a container image from an execution-environment.yml definition using ansible-builder.

Runs \`ansible-builder build -f <file> -c <dir>/context\` in the active Python environment.
Requires ansible-builder (via ansible-dev-tools) and a container runtime (Podman or Docker).
After a successful build, local EE image inventories are refreshed.`,
    annotations: DESTRUCTIVE,
    inputSchema: {
        type: 'object',
        properties: {
            file_path: {
                type: 'string',
                description: 'Absolute path to execution-environment.yml (or .yaml)',
            },
            tag: {
                type: 'string',
                description: 'Optional image tag passed to ansible-builder --tag',
            },
            context_dir: {
                type: 'string',
                description:
                    'Optional build context directory (defaults to <definition-dir>/context)',
            },
        },
        required: ['file_path'],
    },
};

// === Dev Tools ===

export const LIST_DEV_TOOLS_TOOL: McpToolDefinition = {
    name: 'list_ansible_dev_tools',
    description: 'List installed ansible-dev-tools packages and their versions.',
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {},
    },
};

export const INSTALL_DEV_TOOLS_TOOL: McpToolDefinition = {
    name: 'install_ansible_dev_tools',
    description: `Install the ansible-dev-tools package into the active Python environment.

Uses pip in an activated terminal. Equivalent to \`pip install ansible-dev-tools\`.
Call list_ansible_dev_tools first to check if already installed.`,
    annotations: DESTRUCTIVE,
    inputSchema: {
        type: 'object',
        properties: {},
    },
};

export const CREATE_PYTHON_ENVIRONMENT_TOOL: McpToolDefinition = {
    name: 'create_python_environment',
    description: `Create a Python virtual environment for Ansible development.

Creates a venv in the workspace using \`python -m venv\` and selects it.
Only available when running inside VS Code / Cursor (not standalone MCP).`,
    annotations: DESTRUCTIVE,
    inputSchema: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'Virtual environment directory name (default: ".venv")',
            },
        },
    },
};

// === Creator ===

export const GET_CREATOR_SCHEMA_TOOL: McpToolDefinition = {
    name: 'get_ansible_creator_schema',
    description:
        'Get the full ansible-creator command schema showing all available scaffolding commands and their parameters. Use this to understand what content types can be created (collections, playbooks, plugins, etc.) and what options are available for each.',
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {},
    },
};

// === Best Practices ===

export const GET_BEST_PRACTICES_TOOL: McpToolDefinition = {
    name: 'get_ansible_best_practices',
    description: `Get Ansible coding guidelines and best practices for AI-assisted development.

This tool returns comprehensive guidelines covering:
- Guiding principles (Zen of Ansible)
- Project structure (collections, playbooks)
- Coding standards (YAML, Python, naming conventions)
- Role design patterns
- Collections best practices
- Inventories and variables
- Plugins and modules
- Playbook patterns
- Testing strategies

**Use this tool when**:
- Planning what content to create
- Generating Ansible code (playbooks, roles, modules)
- Reviewing or improving existing automation
- Understanding Ansible conventions

**Sections available**:
- full: Complete guidelines document
- principles: Zen of Ansible and guiding principles
- project_structure: Collection and playbook project layouts
- naming: Naming conventions for all content types
- roles: Role design, parameters, templates
- collections: Collection structure and organization
- playbooks: Playbook patterns and best practices
- testing: Testing strategies and validation

Returns the guidelines in Markdown format.`,
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {
            section: {
                type: 'string',
                description: 'Specific section to retrieve. Use "full" for complete document.',
                enum: [
                    'full',
                    'principles',
                    'project_structure',
                    'naming',
                    'roles',
                    'collections',
                    'playbooks',
                    'testing',
                ],
                default: 'full',
            },
        },
    },
};

// === Getting Started ===

export const GET_AGENT_ONBOARDING_TOOL: McpToolDefinition = {
    name: 'get_agent_onboarding',
    description:
        'Get a guide to all available tools, skills, and recommended workflows for this MCP server. Call this first when starting a new session to understand what capabilities are available and how to use them effectively.',
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {},
    },
};

export const GET_EXTENSION_WALKTHROUGH_TOOL: McpToolDefinition = {
    name: 'get_extension_walkthrough',
    description:
        'Start an interactive, AI-guided tour of the Ansible extension. Walks through your current workspace, demonstrates plugin discovery, task generation, skills, and scaffolding capabilities step by step.',
    annotations: READ_ONLY,
    inputSchema: {
        type: 'object',
        properties: {},
    },
};

// === Playbook Execution ===

export const RUN_PLAYBOOK_NAVIGATOR_TOOL: McpToolDefinition = {
    name: 'run_playbook_navigator',
    description: `Run an Ansible playbook using ansible-navigator in stdout mode.

Executes \`ansible-navigator run <playbook> --mode stdout\` in the active Python environment.
Requires ansible-navigator (via ansible-dev-tools) to be installed.
Supports the same playbook flags as ansible-playbook (inventory, limit, tags, check, diff,
become, connection, vault, etc.) passed through via the \`--\` separator.`,
    annotations: DESTRUCTIVE,
    inputSchema: {
        type: 'object',
        properties: {
            playbook_path: {
                type: 'string',
                description: 'Absolute path to the playbook YAML file',
            },
            inventory: {
                type: 'array',
                items: { type: 'string' },
                description: 'Inventory file paths (repeatable)',
            },
            limit: {
                type: 'string',
                description: 'Host pattern to limit execution',
            },
            tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags to select tasks',
            },
            skip_tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags to skip',
            },
            check: {
                type: 'boolean',
                description: 'Run in check mode (dry run)',
            },
            diff: {
                type: 'boolean',
                description: 'Show change diffs',
            },
            extra_vars: {
                type: 'string',
                description: 'Extra variables (key=value or @file)',
            },
            verbose: {
                type: 'number',
                description: 'Verbosity level (0-6)',
            },
            forks: {
                type: 'number',
                description: 'Number of parallel processes (default: 5)',
            },
            connection: {
                type: 'string',
                description: 'Connection type (default: ssh)',
            },
            user: {
                type: 'string',
                description: 'Remote user for connection',
            },
            timeout: {
                type: 'number',
                description: 'Connection timeout in seconds',
            },
            private_key: {
                type: 'string',
                description: 'Path to SSH private key file',
            },
            become: {
                type: 'boolean',
                description: 'Enable privilege escalation',
            },
            become_method: {
                type: 'string',
                description: 'Privilege escalation method (default: sudo)',
            },
            become_user: {
                type: 'string',
                description: 'Privilege escalation target user (default: root)',
            },
            vault_password_file: {
                type: 'string',
                description: 'Path to vault password file',
            },
        },
        required: ['playbook_path'],
    },
};

// === Collection of all static tools ===

export const STATIC_TOOLS: McpToolDefinition[] = [
    // Discovery
    SEARCH_PLUGINS_TOOL,
    GET_PLUGIN_DOC_TOOL,
    LIST_COLLECTIONS_TOOL,
    INSTALL_COLLECTION_TOOL,
    SEARCH_AVAILABLE_COLLECTIONS_TOOL,
    LIST_SOURCE_COLLECTIONS_TOOL,
    GET_COLLECTION_PLUGINS_TOOL,
    GET_GALAXY_PLUGIN_DOC_TOOL,
    GET_SCM_PLUGIN_DOC_TOOL,

    // Task generation
    GENERATE_TASK_TOOL,
    BUILD_TASK_TOOL,
    GENERATE_PLAYBOOK_TOOL,

    // Execution environments
    LIST_EE_TOOL,
    GET_EE_DETAILS_TOOL,
    BUILD_EE_TOOL,

    // Playbook execution
    RUN_PLAYBOOK_NAVIGATOR_TOOL,

    // Dev tools
    LIST_DEV_TOOLS_TOOL,
    INSTALL_DEV_TOOLS_TOOL,
    CREATE_PYTHON_ENVIRONMENT_TOOL,

    // Creator
    GET_CREATOR_SCHEMA_TOOL,

    // Best practices
    GET_BEST_PRACTICES_TOOL,

    // Getting started
    GET_AGENT_ONBOARDING_TOOL,
    GET_EXTENSION_WALKTHROUGH_TOOL,
];
