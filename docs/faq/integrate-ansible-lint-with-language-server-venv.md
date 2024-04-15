# How to integrate `ansible-lint` in venv with Ansible Language Extension

## Background: No need to install ansible-lint system-wide

To make Ansible Language Extension fully function, users need to install
`ansible-lint`. The easiest way to install `ansible-lint` is to install it
system-wide as below:

```sh
# Fedora
## sudo dnf install python3-ansible-lint

# Ubuntu
## sudo apt install ansible-lint
```

However, installing Python packages system-wide is not always preferable because
the it affects the whole system behavior. You can install `ansible-lint` in venv
with normal permission, and integrate it with Ansible Language Extension
instead.

## How to use `ansible-lint` in venv

The outline is fairly simple.

1. Create a venv.
2. Install `ansible-lint` in the venv.
3. Configure path to `ansible-lint` and `ansible` executables in the extension
   settings.
