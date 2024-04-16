# Data collection

`vscode-ansible` has opt-in telemetry collection, provided by
[vscode-redhat-telemetry](https://github.com/redhat-developer/vscode-redhat-telemetry).

## What's included in the vscode-ansible telemetry data

- ansible-language-server start
- errors during `ansible-language-server` start
- any errors from LSP requests
- Ansible core version
- ansible-lint version if installed and enabled
- `ansible-playbook` command runs successfully or fails.
- `ansible-navigator` run command runs successfully or fails.
- Ansible vault (ansible-vault) command run in case it fails.
- Resync Ansible inventory (ansible-inventory) command run in case it fails.
- Execution environment enabled or disabled
- Ansible Lightspeed enabled or disabled
- Ansible Lightspeed code assist enabled or disabled

## What's included in the general telemetry data

Please see the
[vscode-redhat-telemetry data collection information](https://github.com/redhat-developer/vscode-redhat-telemetry/blob/HEAD/USAGE_DATA.md)
for information on what data it collects.

## How to opt-in or out

Use the `redhat.telemetry.enabled` setting to enable or disable telemetry
collection.

Note that this extension abides by Visual Studio Code's telemetry level: if
`telemetry.telemetryLevel` is set to off, then no telemetry events will be sent
to Red Hat, even if `redhat.telemetry.enabled` is set to true. If
`telemetry.telemetryLevel` is set to `error` or `crash`, only events containing
an error or errors property will be sent to Red Hat.
