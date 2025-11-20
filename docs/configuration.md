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
  [documentation](https://ansible.readthedocs.io/projects/lint/configuring/). ).
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
- `ansible.lightspeed.provider`: Select AI provider (`wca`, `openai`, `google`, `custom`).
  - `wca`: Red Hat Ansible Lightspeed with IBM watsonx Code Assistant (default)
  - `openai`: Direct OpenAI API access
  - `google`: Google Gemini API access
  - `custom`: Custom OpenAI-compatible API

- `ansible.lightspeed.apiEndpoint`: API endpoint URL for the selected provider.
  - For WCA: `https://c.ai.ansible.redhat.com` (default)
  - For OpenAI: `https://api.openai.com/v1`
  - For Google: `https://generativelanguage.googleapis.com/v1beta`
  - For Custom: Your custom API endpoint

- `ansible.lightspeed.modelName`: Model name/ID to use.
  - For WCA: Model ID override (optional, for commercial users)
  - For LLM providers: Required model identifier (e.g., `gpt-4`, `gemini-2.5-flash`)

- `ansible.lightspeed.apiKey`: API key for LLM providers.
  - Not used for WCA (uses OAuth2 authentication)
  - Required for `openai`, `google`, and `custom` providers

- `ansible.lightspeed.timeout`: Request timeout in milliseconds (default: 30000).

### Inline Suggestions

- `ansible.lightspeed.suggestions.enabled`: Enable inline suggestions.
  - Note: Currently only supported with WCA provider

- `ansible.lightspeed.suggestions.waitWindow`: Delay (in milliseconds) prior to
  sending an inline suggestion request.

### Advanced Settings

- `ansible.lightspeed.customHeaders`: Custom HTTP headers for LLM providers (JSON object).
  - Example: `{"Custom-Header": "value"}`
  - Not used for WCA

### Backward Compatibility

The following legacy settings are still supported for backward compatibility:

- `ansible.lightspeed.URL`: Mapped to `ansible.lightspeed.apiEndpoint`
- `ansible.lightspeed.modelIdOverride`: Mapped to `ansible.lightspeed.modelName`

See [LLM Provider Documentation](llm-providers.md) for detailed setup instructions and examples.

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
