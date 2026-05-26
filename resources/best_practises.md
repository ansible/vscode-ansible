# Ansible Coding Guidelines for AI Agents

This document provides comprehensive guidelines for AI agents working with Ansible code. Following these practices ensures code quality, maintainability, and consistency.

## Table of Contents

- [Guiding Principles](#guiding-principles)
- [Development Workflow](#development-workflow)
  - [Project structure](#project-structure)
    - [Collection project](#collection-project)
    - [Playbook project](#playbook-project)
  - [Version Control](#version-control)
  - [Starting Approach](#starting-approach)
  - [Testing and Validation](#testing-and-validation)
    - [Testing Strategies](#testing-strategies)
    - [Smoke Testing](#smoke-testing)
- [Coding Standards](#coding-standards)
  - [Formatting](#formatting)
    - [YAML Formatting](#yaml-formatting)
    - [Python Formatting](#python-formatting)
    - [Markdown Formatting](#markdown-formatting)
  - [Ansible specific](#ansible-specific)
    - [Naming Conventions](#naming-conventions)
      - [General Naming Rules](#general-naming-rules)
      - [Variable Naming](#variable-naming)
      - [Task Naming](#task-naming)
      - [Role-Specific Naming](#role-specific-naming)
    - [Collections](#collections)
    - [Roles](#roles)
    - [Inventories and Variables](#inventories-and-variables)
    - [Plugins and modules](#plugins-and-modules)
    - [Playbooks](#playbooks)
      - [Structure and Simplicity](#structure-and-simplicity)
      - [Tags](#tags)
      - [Debug and Output](#debug-and-output)
      - [Waiting for Conditions](#waiting-for-conditions)
  - [Python code](#python-code)
  - [Jinja2 Templates](#jinja2-templates)
  - [Other files](#other-files)
    - [Line Wrapping](#line-wrapping)
- [Glossary](#glossary)

## Guiding Principles

The Zen of Ansible serves as a guidepost when specific practices are unclear:

- Ansible is not Python
- YAML sucks for coding
- Playbooks are not for programming
- Ansible users are most probably not programmers
- Clear is better than cluttered
- Concise is better than verbose
- Simple is better than complex
- Readability counts
- Helping users get things done matters most
- User experience beats ideological purity
- Magic conquers the manual
- When giving users options, always use convention over configuration
- Declarative is always better than imperative - most of the time
- Focus avoids complexity
- Complexity kills productivity
- If the implementation is hard to explain, it is a bad idea
- Every shell command and UI interaction is an opportunity to automate
- Just because something works, doesn't mean it can't be improved
- Friction should be eliminated whenever possible
- Automation is a continuous journey that never ends

## Development Workflow

### Project structure

#### Collection project

A collection project packages reusable roles, plugins, and docs for distribution (private hub or Galaxy). Use when you need shareable, versioned automation building blocks that multiple teams and environments can consume consistently.

- [ ] Use standard collection structure with `galaxy.yml`, `roles/`, `plugins/`, `meta/`, `tests/`, `docs/`
- [ ] Scaffold with `ansible-creator init collection` and extend via `ansible-creator add`
- [ ] Focus on clear public interfaces using `argument_specs` in [Roles](#roles)
- [ ] Implement provider abstraction for multi-platform support
- [ ] Follow [naming conventions](#naming-conventions) throughout
- [ ] Ensure rigorous [formatting](#formatting) and linting compliance
- [ ] Pin Execution Environment, collections, and Python dependencies for deterministic builds
- [ ] Implement CI with `ansible-lint` and Molecule [testing](#testing-strategies)
- [ ] Use [semantic versioning](#glossary) with CHANGELOG for safe upgrades

#### Playbook project

A playbook project orchestrates landscapes and types via one or more playbooks, with all role and plugin authoring done in an adjacent in-repo collection kept local until mature enough to become a standalone collection. Use when you need purpose-built orchestration with tightly scoped, reusable roles that don't yet need external distribution.

- [ ] Scaffold with `ansible-creator init playbook` and add content with `ansible-creator add`
- [ ] Use per-environment [inventories](#inventories-and-variables) in structured directories
- [ ] Organize playbooks in `playbooks/` directory
- [ ] Keep adjacent collection in `collections/ansible_collections/<namespace>/<name>/`
- [ ] Emphasize [data-driven inputs](#inventories-and-variables) following [SSOT](#glossary) principles
- [ ] Maintain clear [As-Is vs To-Be](#as-is-vs-to-be-information) separation
- [ ] Use [FQCNs](#collections) for all modules, roles, and plugins
- [ ] Ensure all content is [idempotent](#idempotency-and-check-mode) and supports [check mode](#idempotency-and-check-mode)
- [ ] Pin Execution Environment and declare supported OS and `ansible-core` matrix
- [ ] Enforce CI with `ansible-lint` and [Molecule for roles](#testing-strategies)

### Version Control

- [ ] Manage all Ansible content with version control system
- [ ] Track changes and collaborate effectively using Git or similar VCS
- [ ] Commit frequently with descriptive commit messages
- [ ] Use branches for feature development and bug fixes
- [ ] Review changes before merging to main branch
- [ ] Tag releases with semantic versioning

### Starting Approach

- [ ] Start simple with basic playbooks and static inventories
- [ ] Refactor and modularize as project grows
- [ ] Avoid over-engineering solutions at the beginning
- [ ] Begin with straightforward implementations
- [ ] Add complexity only when needed and justified
- [ ] Build incrementally from working foundation

### Testing and Validation

#### Testing Strategies

- [ ] Implement comprehensive testing strategies for reliability
- [ ] Adopt smoke testing for quick validation
- [ ] Use unit testing for individual components
- [ ] Implement integration testing for complete workflows
- [ ] Increase reliability and reduce costs through testing
- [ ] Test playbooks in non-production environments first
- [ ] Validate changes before deploying to production
- [ ] Use `molecule` or similar tools for role testing
- [ ] Test against multiple platforms when supporting diverse environments
- [ ] Automate testing as part of CI/CD pipeline

#### Smoke Testing

- [ ] Perform smoke tests after starting services
- [ ] Verify services are functioning correctly after deployment
- [ ] Test basic functionality immediately after changes
- [ ] Use simple health checks to validate service availability
- [ ] Implement quick validation tests for critical paths
- [ ] Fail fast if smoke tests indicate problems

## Coding Standards

### Formatting

#### YAML Formatting

- [ ] Indent at two spaces
- [ ] Indent list contents beyond the list definition
- [ ] Use `.yml` extension for all YAML files
- [ ] Use double quotes for YAML strings except Jinja2 strings which use single quotes
- [ ] Do not use quotes for module keywords like `present` or `absent`
- [ ] Use quotes for user-side strings such as descriptions, names, and messages
- [ ] Use `true` and `false` for boolean values, not `yes`/`no` or `True`/`False`
- [ ] Spell out task arguments in YAML style, not `key=value` format
- [ ] Split long lines using YAML folding sign `>-` not `>`
- [ ] Break long `when` conditions into lists
- [ ] Keep lines under 160 characters when possible
- [ ] Avoid trailing spaces at end of lines
- [ ] Include newline character at end of file
- [ ] Start YAML files with `---` document start marker
- [ ] Avoid key duplicates in mappings
- [ ] Quote octal values to avoid confusion across YAML versions
- [ ] Maintain proper indentation for comments aligned with content
- [ ] Use proper spacing around colons, commas, and brackets
- [ ] Ensure proper spacing before and after colons
- [ ] Ensure proper spacing before and after commas
- [ ] Comment indentation should match content indentation
- [ ] Avoid blank lines exceeding reasonable limits
- [ ] Ensure proper indentation throughout

#### Python Formatting

- [ ] Running `ruff format` should pass without making additional changes
- [ ] Running `ruff` should return no errors
- [ ] Running `mypy .` should return no problems
- [ ] Use Python type hints to document variable types
- [ ] Running `pydoclint` should pass for docstrings
- [ ] File headers and functions should have comments explaining their intent
- [ ] Use `pytest` for unit tests, not `unittest`
- [ ] Follow Python naming conventions with `snake_case`

#### Markdown Formatting

- [ ] Use standard Markdown formatting for documentation
- [ ] Include clear section headers and table of contents
- [ ] Use code blocks with language identifiers
- [ ] Keep line lengths reasonable for readability

### Ansible specific

#### Naming Conventions

##### General Naming Rules

- [ ] Use `snake_case_naming_schemes` for all YAML and Python files, variables, arguments, repositories, and dictionary keys
- [ ] Use valid Python identifiers with no special characters except underscore
- [ ] Use mnemonic, descriptive names without unnecessary abbreviations
- [ ] Follow pattern `object[_feature]_action` for consistent sorting
- [ ] Avoid numbering roles and playbooks
- [ ] Name all tasks, plays, and task blocks
- [ ] Write task names in imperative form
- [ ] Use capital letters for unavoidable abbreviations
- [ ] Use `.yml` extension, not `.yaml`
- [ ] No dashes in role names as they cause issues with collections

##### Variable Naming

- [ ] Variable names must contain only lowercase alphanumeric characters and underscore
- [ ] Variable names must start with an alphabetic or underscore character
- [ ] Use bracket notation instead of dot notation for value retrieval
- [ ] Avoid using special Ansible reserved names or read-only magic variables
- [ ] Do not use Python keywords as variable names
- [ ] Do not use Jinja2 templating in variable names
- [ ] Prefix role variables with role name to avoid collisions
- [ ] Use double underscore prefix for role internal variables
- [ ] Variables names must be strings
- [ ] Variables names must be ASCII
- [ ] Variables names must not be Python keywords
- [ ] Variables names must not contain jinja2 templating
- [ ] Variables names from roles should use `role_name_` as prefix

##### Task Naming

- [ ] All tasks must have descriptive names using `name` parameter
- [ ] Name all tasks to enhance readability and debugging
- [ ] All plays must have names
- [ ] Task names should start with an uppercase letter
- [ ] Choose meaningful names that convey purpose and intent
- [ ] Write task names that are self-documenting
- [ ] Place Jinja2 templates at the end of task names, not at the beginning
- [ ] Do not use variables in play names as they don't expand properly
- [ ] Do not use loop variables in task names
- [ ] Task names within a single play should be unique
- [ ] Prefix task names in sub-task files with file identifier for easier troubleshooting

##### Role-Specific Naming

- [ ] Prefix all role variables with role name
- [ ] Use double underscore prefix for internal variables
- [ ] Modules in roles need role prefix
- [ ] Tags in roles should be prefixed with role name or unique descriptive prefix
- [ ] Role names must contain only lowercase alphanumeric characters and underscore
- [ ] Role names must start with an alphabetic character

#### Collections

##### Structure and Organization

- [ ] Collections should be at type or landscape level, not individual roles
- [ ] Create common role for content shared across multiple roles
- [ ] Author loosely coupled, hierarchical content
- [ ] Package multiple related roles together in collections
- [ ] Use FQCN for all modules, roles, and playbooks
- [ ] Prefer `ansible.builtin` collection for internal Ansible actions
- [ ] Use `ansible.legacy` if you need local overrides
- [ ] Avoid `collections` keyword, use FQCN instead
- [ ] Use canonical module names for better performance and compatibility
- [ ] Avoid nesting modules in deep directories within collections
- [ ] Use flat directory structure for modules in collections
- [ ] Migrate deep directory structures using redirects in `meta/runtime.yml`

##### Variables

- [ ] Create implicit collection variables referenced in role defaults
- [ ] Use pattern `role_name_var` followed by `collection_name_var`
- [ ] Avoid variable collisions when reusing roles
- [ ] Keep roles reusable outside collection
- [ ] Clear documentation of collection vs role variables

##### Documentation

- [ ] Include README in collection root
- [ ] Document purpose of collection
- [ ] Link to license file
- [ ] Provide general usage info including supported `ansible-core` versions
- [ ] Document required libraries
- [ ] Generate plugin documentation from code
- [ ] Include supplemental docs in `docs/docsite/rst/`

##### License

- [ ] Include LICENSE or COPYING in root directory
- [ ] Note different licenses in file headers if applicable

#### Roles

##### Design Principles

- [ ] Design roles focused on functionality, not software implementation
- [ ] Design for specific, guaranteed outcomes with limited scope
- [ ] Place common content in reusable common role within collections
- [ ] Author loosely coupled, hierarchical content
- [ ] Avoid hard dependencies on external roles or variables
- [ ] Design interface focused on functionality, not implementation details
- [ ] Limit consumer need to understand specific implementation details

##### Role Structure

- [ ] Use `ansible-galaxy init` structure for consistency
- [ ] Use semantic versioning with `0.y.z` before stable release
- [ ] Package roles in collections for distribution
- [ ] Use `meta/argument_specs.yml` for argument validation in Ansible 2.11+
- [ ] Break complex task files down into discrete parts
- [ ] Keep entry files to minimal size
- [ ] Move reusable functions to `module_utils/` or `plugin_utils/`

##### Parameters and Variables

- [ ] All defaults and arguments prefixed with role name
- [ ] Internal variables prefixed with double underscore
- [ ] Define provider variable as `role_name_provider`
- [ ] Set `role_name_provider_os_default` variable for OS defaults
- [ ] All external arguments should have default values in `defaults/main.yml`
- [ ] Use `vars/main.yml` for large lists, magic values, constants
- [ ] Comment out variables in `defaults/main.yml` if no meaningful default exists
- [ ] Do not give default values in `vars/main.yml` as they have high precedence
- [ ] Do not override role defaults or vars using `set_fact`
- [ ] Use smallest scope for variables
- [ ] Limit use of `set_fact` as facts are global

##### Platform Support

- [ ] Avoid testing distribution and version directly in tasks
- [ ] Add variable files to `vars/` for each supported distribution
- [ ] Use `tasks/set_vars.yml` pattern for loading platform-specific variables
- [ ] Use `lookup('first_found')` for platform-specific tasks
- [ ] Use bracket notation for facts
- [ ] Handle case where user specifies `gather_facts: false`
- [ ] Ensure `ansible_facts` used by role with `setup` module when needed
- [ ] Use distribution, `os_family` hierarchy for platform-specific vars

##### Templates

- [ ] Add `ansible_managed` comment at top of templates
- [ ] Do not include timestamps in templates
- [ ] Use `backup: true` until user requests configurability
- [ ] Use `role_path/subdir/` prefix with variable filenames
- [ ] Append `.j2` to template filenames
- [ ] Keep filenames close to destination system names
- [ ] Use `template` module over `copy` for most file pushes
- [ ] Avoid `lineinfile` where feasible, prefer `template` or specific modules

##### Documentation

- [ ] Create meaningful README in role root
- [ ] Include example playbooks
- [ ] List inbound and outbound argument specifications
- [ ] Document user-facing capabilities
- [ ] Specify idempotent status
- [ ] Use fully qualified role names in examples
- [ ] Use RFC-compliant addresses in examples
- [ ] Document all tags and their purposes
- [ ] Document designation as atomic if applicable

##### Module and Command Usage

- [ ] Use specific modules instead of generic `command` or `shell`
- [ ] Prefer Ansible built-in modules to leverage idempotency and error handling
- [ ] Use meta modules when possible
- [ ] Prefer `command` module over `shell` unless shell features are needed
- [ ] Always use `changed_when` with `command` and `shell` modules
- [ ] Use `creates` or `removes` argument when appropriate
- [ ] Add justifying comments when using `command` or `shell` modules
- [ ] All tasks must be idempotent with no changes on second run
- [ ] Avoid calling `package` module iteratively, use lists instead
- [ ] Use specific package managers when platform differences require it
- [ ] Always specify `state` parameter in modules for clarity and consistency
- [ ] Explicitly define desired state rather than relying on defaults

##### Idempotency and Check Mode

- [ ] All tasks must be idempotent with no changes on second run
- [ ] Support check mode and report changes accurately
- [ ] Use `changed_when` with `command` and `shell` modules
- [ ] Use proper modules instead of commands when possible
- [ ] Tasks should not fail in check mode
- [ ] Register variables properly for check mode support
- [ ] Handle commands in check mode using dry-run flags when available

##### Control Flow and Handlers

- [ ] Avoid `when: foo_result is changed`, use handlers instead
- [ ] Do not use `meta: end_play`, use `meta: end_host` if needed
- [ ] Beware of `ignore_errors: true` especially with blocks containing asserts
- [ ] Use include and import statements to reduce repetition
- [ ] Use `notify` to trigger handlers instead of conditional tasks
- [ ] Ensure each tag achieves meaningful result when used alone
- [ ] Do not create tags that cannot be used standalone
- [ ] Do not create destructive tags that could damage systems

##### Filters and Type Safety

- [ ] Use `bool` filter with bare variables in `when` conditions
- [ ] Use type filters for type safety: `float`, `int`, `bool`
- [ ] Do not use `eq`, `equalto`, or `==` Jinja tests, use `match`, `search`, or `regex`
- [ ] Use `float`, `int`, `bool` filters to cast public API variables
- [ ] Ensure type safety for numeric operations in Jinja

##### Performance

- [ ] Avoid iterative package calls, use lists instead
- [ ] Apply same principle to other modules accepting lists
- [ ] Break complex task files into discrete parts
- [ ] Use parallelization capabilities built into Ansible

##### Anti-Patterns to Avoid

- [ ] Do not use host group names directly, use variables instead
- [ ] Avoid using paths when importing roles, use fully qualified names
- [ ] Do not mix `roles` and `tasks` sections in playbooks
- [ ] Avoid playbook and play variables, use inventory instead
- [ ] Do not use `collections` keyword, use FQCN instead

#### Inventories and Variables

##### Single Source of Truth

- [ ] Identify SSOTs for each piece of information
- [ ] Use dynamic inventory sources to combine multiple SSOTs
- [ ] Keep only unique data static in inventory
- [ ] Distinguish between technical SSOTs, managed SSOTs, and inventory-only data
- [ ] Limit effort to maintain inventory to absolute minimum
- [ ] Avoid generating potentially conflicting information

##### As-Is vs To-Be Information

- [ ] Clearly differentiate between discovered and managed information
- [ ] Focus inventory on managed information representing desired state
- [ ] Do not confuse facts with variables
- [ ] Use discovered info only when not part of desired state
- [ ] Maintain clear separation between As-Is and To-Be information

##### Inventory Structure

- [ ] Use structured directory instead of single file
- [ ] Include dynamic inventory plugin configuration files
- [ ] Use `host_vars` and `group_vars` directories
- [ ] Variable file names should match role names except for `ansible.yml`
- [ ] Keep `groups_and_hosts` file free of variables
- [ ] Use subdirectories in `host_vars` and `group_vars` for complex setups
- [ ] Use ini-format for `groups_and_hosts` file for readability

##### Loop Over Hosts

- [ ] Rely on inventory to loop over hosts, not lists of hosts
- [ ] Use inventory groups and patterns for host management
- [ ] Leverage Ansible parallelization and throttling capabilities
- [ ] Use `--limit` parameter to restrict execution
- [ ] Avoid creating lists of hosts in variables
- [ ] Use inventory structure for host iteration

##### Variable Types and Precedence

- [ ] Restrict usage to simplified precedence levels
- [ ] Avoid playbook and play variables, use inventory instead
- [ ] Avoid scoped variables unless needed for runtime
- [ ] Use role defaults for default values
- [ ] Use inventory vars for desired state
- [ ] Use role vars for constants
- [ ] Reserve `extra_vars` for troubleshooting and validation only
- [ ] Do not use extra vars to define desired state
- [ ] Understand simplified variable precedence: defaults, inventory, facts, role vars, scoped vars, runtime vars, `extra_vars`

#### Plugins and modules

##### Python Development

- [ ] Review Ansible guidelines for modules and development
- [ ] Use Python type hints for variable types
- [ ] File headers and functions should have intent comments
- [ ] Use `pytest` for unit tests, not `unittest`
- [ ] Write unit tests for all plugins
- [ ] Follow Ansible Developer Guide testing standards

##### Documentation

- [ ] Document all plugin types with input parameters, outputs, and examples
- [ ] Follow Ansible Developer Guide standards
- [ ] Use clear, specific error messages
- [ ] Use `AnsibleModule` helper methods for failures and warnings
- [ ] Use `Display` class for verbosity-based output
- [ ] Document all classes, private and public functions
- [ ] Include intent comments for file headers and functions

##### Code Organization

- [ ] Keep entry files minimal
- [ ] Move reusable code to `module_utils/` or `plugin_utils/`
- [ ] Use `ansible.plugin_builder` for scaffolding new plugins
- [ ] Maintain consistent argspec formatting within collection
- [ ] Ensure a consistent approach to complex `argument_specs` formatting

#### Playbooks

##### Structure and Simplicity

- [ ] Keep playbooks as simple as possible with logic in roles
- [ ] Limit playbooks to lists of roles when possible
- [ ] Use either `tasks` or `roles` section, not both
- [ ] Use `roles` section for static imports
- [ ] Use `tasks` section with `include_role` or `import_role` for dynamic inclusion
- [ ] Avoid mixing `roles` and `tasks` sections
- [ ] Define which structure to use for each purpose: landscape, type, function, component

##### Tags

- [ ] Limit tags to two types: role names and specific meaningful purposes
- [ ] Document all tags and their purposes
- [ ] Ensure each tag achieves meaningful result when used alone
- [ ] Do not create tags that cannot be used standalone
- [ ] Do not create destructive tags that could damage systems
- [ ] Prefix tags in roles with role name

##### Debug and Output

- [ ] Use `verbosity` parameter with debug statements
- [ ] Use conditional debugging with `verbosity` parameter to control display
- [ ] Reserve verbose output for troubleshooting, not production
- [ ] Avoid comments when task names can be descriptive enough
- [ ] Use appropriate verbosity levels for debug messages

##### Waiting for Conditions

- [ ] Wait for specific conditions to be met instead of arbitrary delays
- [ ] Avoid using fixed delays with `pause` or `wait_for` timeout
- [ ] Use `wait_for` module with appropriate conditions
- [ ] Poll for readiness rather than assuming timing
- [ ] Implement retries with `until` loops for reliability
- [ ] Set reasonable timeouts to avoid hanging indefinitely
- [ ] Check service ports, files, or API endpoints for readiness
- [ ] Improve efficiency by avoiding unnecessary waiting

### Python code

- [ ] Running `ruff format` should pass without making additional changes
- [ ] Running `ruff` should return no errors
- [ ] Running `mypy .` should return no problems
- [ ] Use Python type hints to document variable types
- [ ] Running `pydoclint` should pass for docstrings
- [ ] File headers and functions should have comments explaining their intent
- [ ] Use `pytest` for unit tests, not `unittest`
- [ ] Follow Python naming conventions with `snake_case`
- [ ] Use valid Python identifiers with no special characters except underscore

### Jinja2 Templates

- [ ] Use single space separating template markers from variable name
- [ ] Maintain proper spacing around operators and filters
- [ ] Break lengthy templates into multiple files for distinct logical sections
- [ ] Use Jinja for text and semi-structured data, not structured data manipulation
- [ ] Use filter plugins for data transformations instead of complex Jinja
- [ ] Wrap long Jinja expressions across multiple lines for readability
- [ ] Remove braces for implicit templating fields like `when`, `changed_when`, `failed_when`, `until`
- [ ] Avoid invalid Jinja2 templates that would cause runtime errors
- [ ] Ensure proper spacing around operators in Jinja expressions
- [ ] Follow black formatting rules for Jinja expressions
- [ ] Do not use tilde as binary operation in formatted expressions

### Other files

#### Line Wrapping

- [ ] Wrap long Jinja expressions across multiple lines
- [ ] Start with opening braces on new line if first line would be too long
- [ ] Use backslash escapes in double quoted strings for long URLs without spaces
- [ ] Avoid lines longer than 160 characters

## Glossary

### Full Qualified Collection Name (FQCN)

A fully qualified collection name is the complete path to an Ansible module, role, or plugin that includes the namespace and collection name. For example, `ansible.builtin.copy` or `community.general.docker_container`. Using FQCNs ensures that actions use code from the correct namespace, avoiding ambiguity and conflicts that could cause operations to fail or produce unexpected results. FQCNs are required for all modules, plugins, and roles to ensure compatibility and clarity.

### CMDB

A Configuration Management Database is a repository that stores information about IT infrastructure components and their relationships. In the context of Ansible automation, a CMDB serves as a managed Single Source of Truth providing organizational information like ownership and location, as well as To-Be technical information representing the desired state. CMDBs can be integrated with Ansible through dynamic inventory sources to provide comprehensive environment data for automation tasks.

### SSOT

Single Source of Truth refers to the practice of structuring information models so that every data element is stored exactly once and in one authoritative location. In Ansible automation, SSOTs can include technical sources like cloud APIs and hypervisors providing As-Is information, managed sources like CMDBs providing To-Be information, and the inventory itself for unique data not available elsewhere. Identifying and properly using SSOTs minimizes maintenance effort and prevents conflicting information across IT systems.

---

These guidelines represent good practices developed through community experience. Apply them where they make sense for your specific use case and organization. The goal is maintainability, readability, and reusability rather than blind adherence to rules.
