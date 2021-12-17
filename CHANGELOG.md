<!-- markdownlint-disable no-duplicate-heading no-multiple-blanks -->
# Change Log

All notable changes to the Ansible VS Code extension will be documented in this file.

[//]: # (DO-NOT-REMOVE-versioning-promise-START)

```{note}
The change notes follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
except for the title formatting, and this project adheres to [Semantic
Versioning](https://semver.org/spec/v2.0.0.html).
```

<!--
Do *NOT* manually add changelog entries here!
This changelog is managed by Towncrier and is built at release time.
See https://als.rtfd.io/en/latest/contributing/guidelines#adding-change-notes-with-your-prs
for details. Or read
https://github.com/ansible/ansible-language-server/tree/main/docs/changelog-fragments.d#adding-change-notes-with-your-prs
-->

<!-- towncrier release notes start -->


## v0.4.0 (2021-11-25)

### Bugfixes

* Prevented throwing an unhandled exception caused by undefined linter
  arguments settings (#142) {user}`ssbarnea`
* Implemented opening standalone Ansible files that have no workspace
  associated (#140) {user}`ganeshrn`

## v0.3.0 (2021-11-18)

### Minor Changes

* Added support for nested module options (suboptions) (#116)
  {user}`tomaciazek`
* Adopted use of `creator-ee` execution environment (#132)
  {user}`ssbarnea`
* Updated container cleanup logic for execution environment (#111)
  {user}`ganeshrn`

### Bugfixes

* Updated plugin doc cache validate logic for execution environment (#109)
  {user}`ganeshrn`
* Fixed issue with container copy command (#110) {user}`ganeshrn`

## v0.2.6 (2021-10-29)

### Bugfixes

* Fixed auto-completion to account for the builtin modules when used
  with EE (#94) {user}`ganeshrn`

## v0.2.5 (2021-10-23)

### Bugfixes

* Added a guard for linting only playbook files with the Ansible's
  built-in syntax-check when ansible-lint is unavailable. This is used for
  providing the diagnostics information (#89) {user}`priyamsahoo`

## v0.2.4 (2021-10-19)

### Major changes

The most notable changes that happened were:

* Renaming and publishing the package under the `@ansible` scope on
  Npmjs. The new name is `@ansible/ansible-language-server` now
  (#10) {user}`webknjaz`
* Deprecation of the initial `ansible-language-server` npm package that
  existed in the global namespace prior to the rename {user}`ganeshrn`
* Adding the auto-completion and diagnostics support for Ansible
  Execution Environments {user}`ganeshrn`

### Changes

* Started falling back to checking playbooks with the Ansible's built-in
  syntax-check when `ansible-lint` is not installed or disabled (#5)
  {user}`priyamsahoo`
* Set the minimum runtime prerequisites to `npm > 7.11.2` and
  `node >= 12` (#23) {user}`ssbarnea`
* Updated the default settings value to use fully qualified collection
  name (FQCN) during auto-completion (#37) {user}`priyamsahoo`
* Added auto-completion support for Ansible Execution Environments
  (#42 #54 #55) {user}`ganeshrn`
* Added diagnostics support for Ansible Execution Environments (#53)
  {user}`ganeshrn`
* Updated module completion return statement to support sorting as per
  FQCN (#57) {user}`priyamsahoo`

### Bugfixes

* Added a fix to check that the module paths are directories before
  globbing them during the documentation lookup (#38)
  {user}`kimbernator`
* Implemented documentation fragment discovery (#40) {user}`tomaciazek`
* Fixed sort `slice()` exception issue in `ansibleConfig` service (#76)
  {user}`ssbarnea`
* Fixed an issue with progress handling when `ansible-lint` falls back
  to `syntax check` (#88) {user}`yaegassy`

### Misc

* Replaced `decode`/`encodeURI` with a native VS Code mechanism (#8)
  {user}`tomaciazek`
* Implemented the release CD via `workflow_dispatch` (#65)
  {user}`webknjaz`

## v0.1.0-1 (2021-07-28)

* Updated the npm package to include the `out/` folder

## v0.1.0 (2021-07-28)

* Initial ansible language server release. Based on the `vscode-ansible` plugin
  developed by {user}`Tomasz Maciążek <tomaciazek>`
