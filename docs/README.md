# Ansible VS Code Extension

The Ansible extension for Visual Studio Code streamlines Ansible development by
providing an integrated, feature-rich environment tailored for automation
workflows. It offers features such as syntax highlighting, linting, intelligent
code completion, and AI-assisted suggestions via Ansible Lightspeed.

With support for multi-root workspaces, containerized execution environments,
and extensive configuration options, the extension enhances productivity and
ensures consistent code quality for both individual and team-based projects.
This extension adds language support for Ansible in
[Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=redhat.ansible)
and [OpenVSX](https://open-vsx.org/extension/redhat/ansible) by using the
[ansible-language-server](als/README.md).

## Installation Requirements

Before you begin, make sure your system has:

- The [`ansible-dev-tools`](https://github.com/ansible/ansible-dev-tools) python
  package
- A supported version of
  [`ansible-core`](https://docs.ansible.com/ansible/latest/reference_appendices/release_and_maintenance.html)
- Optionally, a `devcontainer.yaml` file to develop in a devcontainer
  eliminating the need to install and manage python versions and packages.

> Note: On Windows, use with the Remote - WSL or Remote - Containers extensions
> for optimal compatibility.

## Manual Extension Activation

It is recommended to open a folder containing Ansible files with a VS Code
workspace.

![Linter support](https://raw.githubusercontent.com/wiki/ansible/vscode-ansible/images/activate-extension.gif){
width=750 height=750 }

Note:

- For Ansible files open in an editor window ensure the language mode is set to
  `Ansible` (bottom right of VS Code window).
- The runtime status of extension should be in activate state. It can be
  verified in the `Extension` window `Runtime Status` tab for `Ansible`
  extension.

## Getting Started

### Welcome Page

The extension provides a comprehensive Welcome Page that serves as a dashboard
for Ansible development tools. Access it as follows:

- Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
- Type "Open Ansible Development Tools menu" and selecting it.

  **OR**

- From the Quick Links panel, click **Getting Started**.

  - The walkthroughs will appear on the right-hand side.

### Interactive Walkthroughs

The extension offers guided walkthroughs to help you quickly get started with
Ansible development using step-by-step instructions.

#### Create an Ansible Environment

Learn how to create a new Ansible playbook, configure the environment using the
status bar, and install the necessary Ansible packages to get set up.

#### Start Automating with Your First Ansible Playbook

This walkthrough guides you through enabling Ansible Lightspeed, creating a
playbook project, writing your first playbook, and saving it within the project
structure.

#### Discover Ansible Development Tools

Explore the full range of Ansible development tools available in the extension,
including scaffolding content, testing, and deployment guidance for your
automation journey.

### Quick Links

The Quick Links panel provides easy access to common Ansible tasks and is
available in the Ansible sidebar view. It can be accessed by clicking on the
Ansible extension icon and includes:

#### Launch Section

This section provides quick access to:

- Getting Started: Opens the Ansible Development Tools welcome page
- Ansible code bot: Documentation for the AI-powered code assistant
- Documentation: Links to Ansible Development Tools documentation
- Settings: Quick access to extension settings

#### Initialize Section

This section helps you create new Ansible projects:

- Collection project: Create a new Ansible collection
- Execution environment project: Set up a new execution environment
- Playbook project: Create a new Ansible playbook project

#### Add Section

This section allows you to add resources to existing projects:

- Collection plugin: Add a plugin to an existing collection
- dev container: Create a dev container configuration
- Devfile: Create a devfile for development environments
- Execution environment template: Create an execution environment file
- Role: Add a role to an existing collection
- Playbook: Generate a playbook with Ansible Lightspeed

## Dev Container Configurations

This extension supports generating dev containers to provide isolated,
consistent Ansible development environments in VS Code. The
[Microsoft Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
is required for this feature. See the
[Ansible Development Tools (ADT)- Execution Environment documentation](https://ansible.readthedocs.io/projects/dev-tools/container/)
for more information on what is included in the generated dev container.

### Create a dev container

Quick Links Panel: Go to Ansible sidebar → click dev container

Command Palette: Ctrl+Shift+P → search "Ansible: Create a dev container"

### Configuration Options

Choose image:

- Upstream: ghcr.io/ansible/community-ansible-dev-tools:latest

- Downstream: registry.redhat.io/.../ansible-dev-tools-rhel8:latest

Set destination and overwrite options in the webview, and click "Create".

### Opening workspace in the dev container

Command Palette: Ctrl+Shift+P → search "Dev Containers: Reopen in container"

Select the dev container file that matches your desired container engine.

The workspace will reopen in a container with all the Ansible Development Tools
(ADT) installed.

## Content Creation Tools

The extension provides webview-based interfaces for creating and scaffolding
Ansible content.

### Creating Collections

You can create a new Ansible collection with a structured layout including:

- Basic collection metadata
- Directory structure for plugins, modules, and roles
- Documentation templates
- Test framework setup

To create a collection:

- Click "Collection project" in the Quick Links panel
- Enter the namespace and collection name
- Specify the destination directory
- Click "Create"

### Creating Playbooks

The extension offers multiple ways to create playbooks:

### Empty Playbook

- Use the command "Ansible: Create an empty Ansible playbook"
- Edit the playbook manually

### AI-Generated Playbook (with Ansible Lightspeed)

- Use the command "Ansible Lightspeed: Playbook generation "
- Describe what you want the playbook to do
- Review and customize the generated playbook

### Playbook Project

- Use the command "Ansible: Create New Playbook Project"
- Enter the namespace and collection name
- Specify the destination directory

A complete project structure will be created with playbooks, inventory, and
configuration files

### Creating Execution Environments

You can create execution environment configurations for containerized Ansible
environments:

1. Click "Execution environment project" in the Quick Links panel

2. Configure: Base image, Collections to include, System packages, Python
   packages

3. Click "Create" to generate the execution environment file

## File association for YAML files

The extension works when a document is assigned the Ansible language. Files are
automatically recognized as 'Ansible' in these cases:

### Without file inspection

- yaml files under `/playbooks` dir.
- files with the following double extension: `.ansible.yml` or `.ansible.yaml`.
- notable yaml names recognized by ansible like `site.yml` or `site.yaml`
- yaml files having playbook in their filename: `*playbook*.yml` or
  `*playbook*.yaml`

Additionally, in VS Code, you can add persistent file association for language
to `settings.json` file like this:

```json
{
  ...

  "files.associations": {
    "*plays.yml": "ansible",
    "*init.yml": "yaml",
  }
}
```

### With file inspection

### File inspection for Ansible keywords

- Primary method is inspection for top level playbook keywords like hosts and
  import_playbook in yaml files.

### Modelines (optional)

- The extension also supports the usage of
  [modelines](https://vim.fandom.com/wiki/Modeline_magic) and when used, it is
  given highest priority and language is set according to modelines. Example and
  syntax of modelines:

```yaml
# code: language=ansible
or
# code: language=yaml
```

Rest all the .yml, or .yaml files will remain yaml by default unless the user
explicitly changes the language to ansible for which the process is mentioned
below.

## Manual extension activation

It is recommended to open a folder containing Ansible files with a VS Code
workspace.

![Linter support](https://raw.githubusercontent.com/wiki/ansible/vscode-ansible/images/activate-extension.gif)

Note:

- For Ansible files open in an editor window ensure the language mode is set to
  `Ansible` (bottom right of VS Code window).
- The runtime status of extension should be in activate state. It can be
  verified in the `Extension` window `Runtime Status` tab for `Ansible`
  extension.

## Features

### Syntax highlighting

The extension provides distinct highlighting for:

- Ansible keywords
- Module names and options
- YAML elements
- Jinja expressions (even in conditionals like when, failed_when, etc.)

![Syntax highlighting](images/syntax-highlighting.png)

> The screenshots and animations presented in this README have been taken using
> the One Dark Pro theme. The default VS Code theme will not show the syntax
> elements as distinctly, unless customized. Virtually any theme other than
> default will do better.

### Validation

![YAML validation](images/yaml-validation.gif)

While you type, the syntax of your Ansible scripts is verified and any feedback
is provided instantaneously.

### Integration with ansible-lint

![Linter support](images/ansible-lint.gif)

On opening and saving a document, `ansible-lint` is executed in the background
and any findings are presented as errors. You might find it useful that
rules/tags added to `warn_list` (see
[Ansible Lint Documentation](https://ansible.readthedocs.io/projects/lint/configuring/))
are shown as warnings instead.

### Smart autocompletion

![Autocompletion](images/smart-completions.gif)

The extension tries to detect whether the cursor is on a play, block or task
etc. and provides suggestions accordingly. There are also a few other rules that
improve user experience:

- the `name` property is always suggested first
- on module options, the required properties are shown first, and aliases are
  shown last, otherwise ordering from the documentation is preserved
- FQCNs (fully qualified collection names) are inserted only when necessary;
  collections configured with the
  [`collections` keyword](https://docs.ansible.com/ansible/latest/collections_guide/index.html#simplifying-module-names-with-the-collections-keyword)
  are honored. This behavior can be disabled in extension settings.

### Auto-closing Jinja expressions

![Easier Jinja expression typing](images/jinja-expression.gif)

When writing a Jinja expression, you only need to type `"{{`, and it will be
mirrored behind the cursor (including the space). You can also select the whole
expression and press `space` to put spaces on both sides of the expression.

### Documentation reference

![Documentation on hover](images/hover-documentation-module.png)

Documentation is available on hover for Ansible keywords, modules and module
options. The extension works on the same principle as `ansible-doc`, providing
the documentation straight from the Python implementation of the modules.

### Jump to module code

![Go to code on Ctrl+click](images/go-to-definition.gif)

You may also open the implementation of any module using the standard _Go to
Definition_ operation, for instance, by clicking on the module name while
holding `ctrl`/`cmd`.

### Ansible Lightspeed with watsonx Code Assistant

The extension integrates with Ansible Lightspeed with watsonx Code Assistant to
provide AI-powered features. Lightspeed provides inline code suggestions as you
type:

- Press Ctrl+. to trigger suggestions
- Press Tab to accept a suggestion
- Press Escape to hide a suggestion

See the guide
[here](https://docs.redhat.com/en/documentation/red_hat_ansible_lightspeed_with_ibm_watsonx_code_assistant/2.x_latest/html/red_hat_ansible_lightspeed_with_ibm_watsonx_code_assistant_user_guide/set-up-lightspeed_lightspeed-user-guide#set-up-lightspeed_lightspeed-user-guide)
to get started.

## Configuration

This extension supports multi-root workspaces, and as such, can be configured on
any level (User, Remote, Workspace and/or Folder).

### Basic Configuration

- `ansible.ansible.path`: Path to the `ansible` executable.
- `ansible.ansible.reuseTerminal`: Enabling this will cause ansible commands run
  through VS Code to reuse the same Ansible Terminal.
- `ansible.ansible.useFullyQualifiedCollectionNames`: Toggles use of fully
  qualified collection names (FQCN) when inserting a module name. Disabling it
  will only use FQCNs when necessary, that is when the collection isn't
  configured for the task.
- `ansible.playbook.arguments`: Specify additional arguments to append to
  ansible-playbook invocation. e.g. `--syntax-check`

### Validation Settings

- `ansible.validation.lint.arguments`: Optional command line arguments to be
  appended to `ansible-lint` invocation. See `ansible-lint`
  [documentation](https://ansible.readthedocs.io/projects/lint/configuring/). ).
- `ansible.validation.lint.enabled`: Enables/disables use of `ansible-lint`.
- `ansible.validation.lint.path`: Path to the `ansible-lint` executable.
- `ansible.ansibleNavigator.path`: Path to the `ansible-navigator` executable.

### Execution Environment Settings

- `ansible.executionEnvironment.containerEngine`: The container engine to be
  used while running with execution environment. Valid values are `auto`,
  `podman` and `docker`. For `auto` it will look for `podman` then `docker`.
- `ansible.executionEnvironment.containerOptions`: Extra parameters passed to
  the container engine command example: `--net=host`
- `ansible.executionEnvironment.enabled`: Enable or disable the use of an
  execution environment.
- `ansible.executionEnvironment.image`: Specify the name of the execution
  environment image.
- `ansible.executionEnvironment.pull.arguments`: Specify any additional
  parameters that should be added to the pull command when pulling an execution
  environment from a container registry. e.g. `--tls-verify=false`
- `ansible.executionEnvironment.pull.policy`: Specify the image pull policy.
  Valid values are `always`, `missing`, `never` and `tag`. Setting `always` will
  always pull the image when extension is activated or reloaded. Setting
  `missing` will pull if not locally available. Setting `never` will never pull
  the image and setting tag will always pull if the image tag is 'latest',
  otherwise pull if not locally available.
- `ansible.executionEnvironment.volumeMounts`: The setting contains volume mount
  information for each dict entry in the list. Individual entry consists of
  - `src`: The name of the local volume or path to be mounted within execution
    environment.
  - `dest`: The path where the file or directory are mounted in the container.
  - `options`: The field is optional, and is a comma-separated list of options,
    such as `ro,Z`

### Python Configuration

- `ansible.python.interpreterPath`: Path to the `python`/`python3` executable.
  This setting may be used to make the extension work with `ansible` and
  `ansible-lint` installations in a Python virtual environment. Supports
  ${workspaceFolder}.
- `ansible.python.activationScript`: Path to a custom `activate` script, which
  will be used instead of the setting above to run in a Python virtual
  environment.

### Lightspeed Configuration

- `ansible.lightspeed.enabled`: Enable Ansible Lightspeed.
- `ansible.lightspeed.URL`: URL for Ansible Lightspeed.
- `ansible.lightspeed.suggestions.enabled`: Enable Ansible Lightspeed with
  watsonx Code Assistant inline suggestions.
- `ansible.lightspeed.suggestions.waitWindow`: Delay (in milliseconds) prior to
  sending an inline suggestion request to Ansible Lightspeed with watsonx Code
  Assistant.
- `ansible.lightspeed.modelIdOverride`: Model ID to override your organization's
  default model. This setting is only applicable to commercial users with an
  Ansible Lightspeed seat assignment.

### Completion & Language Server Settings

- `ansible.completion.provideRedirectModules`: Toggle redirected module provider
  when completing modules.
- `ansible.completion.provideModuleOptionAliases`: Toggle alias provider when
  completing module options.
- `ansibleServer.trace.server`: Traces the communication between VS Code and the
  ansible language server.

## Environment variable

- `LIGHTSPEED_PREFER_RHSSO_AUTH`: When set to `true`, Lightspeed with use the
  OAuth2 Device Flow by default instead of the default OAuth2 authentication.
  You can trigger it manually with the
  `Ansible Lightspeed: Sign in with Red Hat` action.

## Data and Telemetry

The `vscode-ansible` extension collects anonymous [usage data](usage-data.md)
and sends it to Red Hat servers to help improve our products and services. Read
our
[privacy statement](https://developers.redhat.com/article/tool-data-collection)
to learn more. This extension respects the `redhat.telemetry.enabled` setting,
which you can learn more about at
<https://github.com/redhat-developer/vscode-redhat-telemetry#how-to-disable-telemetry-reporting>.

## Known limitations

- The shorthand syntax for module options (key=value pairs) is not supported.
- Nested module options are not supported yet.
- Only Jinja expressions inside Ansible YAML files are supported. To enable
  syntax highlighting for Jinja template files (e.g., .j2), you can install the
  [Better Jinja extension](https://marketplace.visualstudio.com/items?itemName=samuelcolvin.jinjahtml).
- Full support for Jinja blocks (e.g., {% for %}, {% if %}) within Ansible YAML
  files, such as advanced syntax highlighting or autocompletion specific to
  block structures, is not yet implemented. Basic YAML highlighting will apply
  within these blocks.

## Contact

We welcome your feedback, questions and ideas. Learn how to reach us
[here](https://ansible.readthedocs.io/projects/vscode-ansible/contact/).

## Credit

Based on the good work done by
[Tomasz Maciążek](https://github.com/tomaciazek/vscode-ansible)
