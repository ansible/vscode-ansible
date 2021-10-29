<!-- markdownlint-disable no-duplicate-heading -->
# Change Log

All notable changes to the Ansible VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.6] - 2021-10-29

### Bugfixes

* Fix autocompletion of the builtin modules with EE (#94) @ganeshrn

## [0.2.5] - 2021-10-23

### Bugfixes

* Added a guard for linting only playbook files with the Ansible's
  built-in syntax-check when ansible-lint is unavailable. This is used for
  providing the diagnostics information (#89) @priyamsahoo

## [0.2.4] - 2021-10-19

### Major changes

The most notable changes that happened were:

* Renaming and publishing the package under the `@ansible` scope on
  Npmjs. The new name is `@ansible/ansible-language-server` now
  (#10) @webknjaz
* Deprecation of the initial `ansible-language-server` npm package that
  existed in the global namespace prior to the rename @ganeshrn
* Adding the auto-completion and diagnostics support for Ansible
  Execution Environments @ganeshrn

### Changes

* Started falling back to checking playbooks with the Ansible's built-in
  syntax-check when `ansible-lint` is not installed or disabled (#5)
  @priyamsahoo
* Set the minimum runtime prerequisites to `npm > 7.11.2` and
  `node >= 12` (#23) @ssbarnea
* Updated the default settings value to use fully qualified collection
  name (FQCN) during autocompletion (#37) @priyamsahoo
* Added auto-completion support for Ansible Execution Environments
  (#42 #54 #55) @ganeshrn
* Added diagnostics support for Ansible Execution Environments (#53)
  @ganeshrn
* Updated module completion return statement to support sorting as per
  FQCN (#57) @priyamsahoo

### Bugfixes

* Added a fix to check that the module paths are directories before
  globbing them during the documentation lookup (#38) @kimbernator
* Implemented documentation fragment discovery (#40) @tomaciazek
* Fixed sort `slice()` exception issue in `ansibleConfig` service (#76)
  @ssbarnea
* Fixed an issue with progress handling when `ansible-lint` falls back
  to `syntax check` (#88) @yaegassy

### Misc

* Replaced `decode`/`encodeURI` with a native VS Code mechanism (#8)
  @tomaciazek
* Implemented the release CD via `workflow_dispatch` (#65) @webknjaz

## [0.1.0-1] - 2021-07-28

* Updated the npm package to include the `out/` folder

## [0.1.0] - 2021-07-28

* Initial ansible language server release. Based on the `vscode-ansible` plugin
  developed by [Tomasz Maciążek](https://github.com/tomaciazek)
