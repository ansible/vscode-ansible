# Ansible Language Server

This language server adds support for Ansible and is currently used by the
following projects:

* [Ansible extension for vscode/codium](https://github.com/ansible/vscode-ansible)
* [Ansible extension for coc.nvim](https://github.com/yaegassy/coc-ansible)

## Features

### Syntax highlighting

![Syntax highlighting](images/syntax-highlighting.png)

**Ansible keywords**, **module names** and **module options**, as well as
standard YAML elements are recognized and highlighted distinctly. Jinja
expressions are supported too, also those in Ansible conditionals (`when`,
`failed_when`, `changed_when`, `check_mode`), which are not placed in double
curly braces.

> The screenshots and animations presented in this README have been taken using
> the One Dark Pro theme. The default VS Code theme will not show the syntax
> elements as distinctly unless customized. Virtually any theme other than
> default will do better.

### Validation

![YAML validation](images/yaml-validation.gif)

While you type, the syntax of your Ansible scripts is verified and any feedback
is provided instantaneously.

#### Integration with ansible-lint

![Linter support](images/ansible-lint.gif)

On opening and saving a document, `ansible-lint` is executed in the background
and any findings are presented as errors. You might find it useful that
rules/tags added to `warn_list`
(see [Ansible Lint Documentation](https://ansible-lint.readthedocs.io/en/latest/configuring.html))
are shown as warnings instead.

> If you also install `yamllint`, `ansible-lint` will detect it and incorporate
> into the linting process. Any findings reported by `yamllint` will be exposed
> in VSCode as errors/warnings.

***Note***

If `ansible-lint` is not installed/found or running `ansible-lint` results in
error it will fallback to `ansible --syntax-check` for validation.

### Smart autocompletion

![Autocompletion](images/smart-completions.gif)

The extension tries to detect whether the cursor is on a play, block or task
etc. and provides suggestions accordingly. There are also a few other rules that
improve user experience:

* the `name` property is always suggested first
* on module options, the required properties are shown first, and aliases are
  shown last, otherwise ordering from the documentation is preserved
* FQCNs (fully qualified collection names) are inserted only when necessary;
  collections configured with the
  [`collections` keyword]([LINK](https://docs.ansible.com/ansible/latest/user_guide/collections_using.html#simplifying-module-names-with-the-collections-keyword))
  are honored. This behavior can be disabled in extension settings.

#### Auto-closing Jinja expressions

![Easier Jinja expression typing](images/jinja-expression.gif)

When writing a Jinja expression, you only need to type `"{{<space>`, and it
will be mirrored behind the cursor (including the space). You can also select
the whole expression and press `space` to put spaces on both sides of the
expression.

### Documentation reference

![Documentation on hover](images/hover-documentation-module.png)

Documentation is available on hover for Ansible keywords, modules and module
options. The extension works on the same principle as `ansible-doc`, providing
the documentation straight from the Python implementation of the modules.

#### Jump to module code

![Go to code on Ctrl+click](images/go-to-definition.gif)

You may also open the implementation of any module using the standard *Go to
Definition* operation, for instance, by clicking on the module name while
holding `ctrl`/`cmd`.

## Language Server Settings

The following settings are supported.

* `ansible.ansible.path`: Path to the `ansible` executable.
* `ansible.ansible.useFullyQualifiedCollectionNames`: Toggles use of
  fully qualified collection names (FQCN) when inserting a module name.
  Disabling it will only use FQCNs when necessary, that is when the collection
  isn't configured for the task.
* `ansible.ansibleLint.arguments`: Optional command line arguments to be
  appended to `ansible-lint` invocation. See `ansible-lint` documentation.
* `ansible.ansibleLint.enabled`: Enables/disables use of `ansible-lint`.
* `ansible.ansibleLint.path`: Path to the `ansible-lint` executable.
* `ansible.ansibleNavigator.path`: Path to the `ansible-navigator` executable.
* `ansible.ansiblePlaybook.path`: Path to the `ansible-playbook` executable.
* `ansible.executionEnvironment.containerEngine`: The container engine to be used
  while running with execution environment. Valid values are `auto`, `podman` and
  `docker`. For `auto` it will look for `podman` then `docker`.
* `ansible.executionEnvironment.enabled`: Enable or disable the use of an
   execution environment.
* `ansible.executionEnvironment.image`: Specify the name of the execution
  environment image.
* `ansible.executionEnvironment.pullPolicy`: Specify the image pull policy.
  Valid values are `always`,
  `missing`, `never` and `tag`. Setting `always` will always pull the image
  when extension is activated or reloaded.
  Setting `missing` will pull if not locally available. Setting `never` will
  never pull the image and setting tag will always pull if the image tag is
  'latest', otherwise pull if not locally available.
* `ansible.python.interpreterPath`: Path to the `python`/`python3` executable.
  This setting may be used to make the extension work with `ansible` and
  `ansible-lint` installations in a Python virtual environment.
* `ansible.python.activationScript`: Path to a custom `activate` script, which
  will be used instead of the setting above to run in a Python virtual
  environment.

## Developer support

For details on setting up development environment and debugging refer to the
[development document].

[development document]:
https://github.com/ansible/ansible-language-server/blob/main/docs/development.md

## Requirements

* [Ansible 2.9+](https://docs.ansible.com/ansible/latest/index.html)
* [Ansible Lint](https://ansible-lint.readthedocs.io/en/latest/) (required,
  unless you disable linter support)
* [yamllint](https://yamllint.readthedocs.io/en/stable/) (optional)

For Windows users, this extension works perfectly well with extensions such as
`Remote - WSL` and `Remote - Containers`.

> If you have any other extension providing language support for Ansible, you
  might need to uninstall it first.

## Known limitations

* The shorthand syntax for module options (key=value pairs) is not supported.
* Nested module options are not supported yet.
* Only Jinja *expressions* inside Ansible YAML files are supported. In order to
  have syntax highlighting of Jinja template files, you'll need to install other
  extension.
* Jinja *blocks* (inside Ansible YAML files) are not supported yet.

## Credit

Based on the good work done by [Tomasz Maciążek](https://github.com/tomaciazek/vscode-ansible)
