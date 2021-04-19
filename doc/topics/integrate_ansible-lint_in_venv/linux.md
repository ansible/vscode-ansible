# For Linux users

## Set up a venv

Create a venv. In this example I will create a `system` venv under `~/venv`.

```sh
python3 -m venv ~/venv/system
```

Get into the venv, and install `ansible-lint` with `ansible` and `yamllint`. `ansible` is necessary to get `ansible-lint` to work. Then get out of the venv.

`yamllint` is optional. The syntax to install `ansible-lint` is shown in [ansible-lint official documentation](https://ansible-lint.readthedocs.io/en/latest/installing.html#using-pip-or-pipx).

```sh
source ~/venv/system/bin/activate
pip install "ansible-lint[community,yamllint]"
deactivate
```

## Add executables in venv to PATH

In order for Ansible Language Extension to access `ansible-lint`, there should be `ansible-lint` executable in the directory, which is in PATH environment variable. Of course you may add `~/venv/system/bin` directory to PATH, but there is a smarter way to minimize the impact on PATH.

That is to add a symbolic link to `ansible-lint` in the directory, which is in the PATH. Since `ansible-lint` internally executes `ansible` and `ansible-playbook` commands, you will also need to create symbolic links to them. On the other hand, you don't need to create a symbolic link to `yamllint` executable, because `yamllint` is not invoked as an external command by `ansible-lint`, but is imported as a python module.

In this example, we assume that `~/.local/bin` is in the PATH. This directory is useful to avoid making impact on the whole system, unlike `/usr/local/bin`.

```sh
ln -s ~/venv/system/bin/ansible-lint ~/.local/bin/ansible-lint
ln -s ~/venv/system/bin/ansible ~/.local/bin/ansible
ln -s ~/venv/system/bin/ansible-playbook ~/.local/bin/ansible-playbook
```

Now `ansible-lint` should be successfully integrated with Ansible Language Extension. You need to restart VS Code after installing `ansible-lint` and adding it to the PATH.

If `ansible-lint` seems still not working, you can test by running `ansible-lint` manually and observe the output. If you can't see almost the same error as manual execution on VS Code, something goes wrong.

```sh
ansible-lint --version
# ansible-lint 5.0.6 using ansible 2.10.7

ansible-lint playbook.yml
# unnamed-task: All tasks should be named
# playbook.yml:3 Task/Handler: debug msg=test
#
# yaml: comment not indented like content (comments-indentation)
# playbook.yml:5
```

The `playbook.yml` used above is following:

```yml
- hosts: localhost
  tasks:
    - debug:
        msg: test
 # a comment with a different indent
```
