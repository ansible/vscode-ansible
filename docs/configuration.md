# Configuration

This extension supports multi-root workspaces, and as such, can be configured on
any level (User, Remote, Workspace and/or Folder).

## Basic Configuration

- `ansible.ansible.path`: Path to the `ansible` executable.
- `ansible.ansible.reuseTerminal`: Enabling this will cause ansible commands run
  through VS Code to reuse the same Ansible Terminal.
- `ansible.ansible.useFullyQualifiedCollectionNames`: Toggles use of fully
  qualified collection names (FQCN) when inserting a module name. Disabling it
  will only use FQCNs when necessary, that is when the collection isn't
  configured for the task.
- `ansible.playbook.arguments`: Specify additional arguments to append to
  ansible-playbook invocation. e.g. `--syntax-check`

## Validation Settings

- `ansible.validation.lint.arguments`: Optional command line arguments to be
  appended to `ansible-lint` invocation. See `ansible-lint`
  [documentation](https://docs.ansible.com/projects/lint/configuring/).
- `ansible.validation.lint.enabled`: Enables/disables use of `ansible-lint`.
- `ansible.validation.lint.path`: Path to the `ansible-lint` executable.
- `ansible.ansibleNavigator.path`: Path to the `ansible-navigator` executable.

## Execution Environment Settings

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

## Python Configuration

- `ansible.python.interpreterPath`: Path to the `python`/`python3` executable.
  This setting may be used to make the extension work with `ansible` and
  `ansible-lint` installations in a Python virtual environment. Supports
  ${workspaceFolder}.
- `ansible.python.activationScript`: Path to a custom `activate` script, which
  will be used instead of the setting above to run in a Python virtual
  environment.

## Lightspeed Configuration

### Core Settings

- `ansible.lightspeed.enabled`: Enable/disable Ansible Lightspeed.
- `ansible.lightspeed.timeout`: Request timeout in milliseconds (default:
  30000).

### LLM Provider Settings

Provider configuration is managed through the LLM Provider Settings panel. It
can be accessed from the Ansible Development Tools (ADT) sidebar under the
Generative AI section, or from the Command Palette (`Ctrl+Shift+P` /
`Cmd+Shift+P`) with:

```text
Ansible Lightspeed: Open LLM Provider Settings
```

The panel supports three providers:

- **IBM watsonx (WCA):** Red Hat Ansible Lightspeed with IBM watsonx Code
  Assistant (default). Uses OAuth2 authentication.
- **Google Gemini:** Direct access to Google Gemini models. Requires an API key.
- **Red Hat AI:** Supports models hosted on the Red Hat AI platform through any
  OpenAI-compatible endpoint. Requires an API endpoint, API key, and model name.

Provider settings (API endpoint, API key, model name) are stored securely using
VS Code's secret storage for sensitive fields and global state for other values.

See [LLM Provider Documentation](llm-providers.md) for detailed setup
instructions and examples.

### Inline Suggestions

- `ansible.lightspeed.suggestions.enabled`: Enable inline suggestions.
  - Note: Currently only supported with the WCA provider

- `ansible.lightspeed.suggestions.waitWindow`: Delay (in milliseconds) prior to
  sending an inline suggestion request.

### Deprecated Settings

The following settings are deprecated and will be removed in a future release.
Use the LLM Provider Settings panel instead.

- `ansible.lightspeed.provider`: Select AI provider. Use the LLM Provider
  Settings panel.
- `ansible.lightspeed.apiEndpoint`: API endpoint URL. Use the LLM Provider
  Settings panel.
- `ansible.lightspeed.modelName`: Model name/ID. Use the LLM Provider Settings
  panel.
- `ansible.lightspeed.apiKey`: API key. Use the LLM Provider Settings panel for
  secure storage.

Existing values from deprecated settings are automatically migrated to the panel
storage on first activation.

## Completion & Language Server Settings

- `ansible.completion.provideRedirectModules`: Toggle redirected module provider
  when completing modules.
- `ansible.completion.provideModuleOptionAliases`: Toggle alias provider when
  completing module options.
- `ansibleServer.trace.server`: Traces the communication between VS Code and the
  ansible language server.

## Environment variables

- `LIGHTSPEED_PREFER_RHSSO_AUTH`: When set to `true`, Lightspeed with use the
  OAuth2 Device Flow by default instead of the default OAuth2 authentication.
  You can trigger it manually with the
  `Ansible Lightspeed: Sign in with Red Hat` action.
