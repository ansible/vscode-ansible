# For Mac users

## Procedure

The way to make `ansible-lint` in venv available from Ansible Language Extension is basically the same as [Linux](linux.md). So check out the procedure of [Linux](linux.md) for the detailed instruction.

Nevertheless, only the default PATH environment variable is different on Mac, so you can create symbolic links to `ansible-lint`, `ansible`, and `ansible-playbook` with the following commands.

```sh
ln -s ~/venv/system/bin/ansible-lint ~/.bin/ansible-lint
ln -s ~/venv/system/bin/ansible ~/.bin/ansible
ln -s ~/venv/system/bin/ansible-playbook ~/.bin/ansible-playbook
```
