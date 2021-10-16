# Change Log

## 0.5.0 (UNRELEASED)

* feat: update ansible-language-server version (#228) @ganeshrn
* feat: lower minimal vscode version to 1.48.0 (July 2020) (#206) @ssbarnea
* feat: introduce ui tests based on vscode-extension-tester (#208) @odockal
* feat: add setting options for execution environment (#200) @ganeshrn
* feat: prompt to uninstall incompatible extensions (#170) @ssbarnea
* feat: update default setting value for using FQCN (#196) @priyamsahoo
* feat: add context menus and commands for running playbooks (#137) @webknjaz
* feat: rename extension to redhat.ansible (#159) @ssbarnea
* feat: adopt the new language server (#142) @tomaciazek
* fix: remove unused files from vsix artifact (#239) @ssbarnea
* fix: upgrade language server to 0.2.2-beta (#238) @ssbarnea
* fix: ensure path related settings are not synced (#235) @ssbarnea
* fix: update npm dependencies (#220) @ssbarnea
* fix: bump nth-check dependency to 2.0.1 (#219) @ssbarnea
* fix: switch debug listening port to fix unbound breakpoints (#212) @tomaciazek
* fix: update dependencies (#192) @ssbarnea
* fix: restore schema verification for some files (#169) @ssbarnea
* docs: update readme with language server link (#173) @ganeshrn
* chore: updated urls after org move (#161) @ssbarnea
* fix: restore redhat branded extension icon (#157) @ssbarnea
* fix: switch publisher from zbr to redhat (#136) @ssbarnea
* Remove an unused i18n string "categroy" (#138) @webknjaz

## 0.4.5

* Clean old violations when running the linter again

## 0.4.4

* Revalidate documents on save (#95) @ssbarnea

## 0.4.3

* Auto-add missing Ansible YAML tags like `!vault`
* Recognize Ansible files using `.yaml` extension in addition to `.yml`

## 0.4.2

* Reduce minimal version of vscode that is required (#90) @ssbarnea

## 0.4.0

* Added vaults encryption and decryption support via `ansible-vault` command (#78) @FlorianLaunay

## 0.3.2

* Use ansible-lint severity for VSCode diagnostics (#68) @FloSchwalm
* Match found problems to source files (#70) @FloSchwalm
* docs: added instructions on how to integrate `ansible-lint` in venv w… (#67) @stopendy

## 0.3.1

* docs: mention YAML tags configuration (#61) @ssbarnea
* [pre-commit.ci] pre-commit autoupdate (#55) @pre-commit-ci
* feat: add logging information (#62) @ssbarnea
* fix: advertise Microsoft Python extension as required (#54) @ssbarnea
* Create LICENSE (#52) @ssbarnea
* chore: fix pre-commit eslint dependencies (#53) @ssbarnea
* Add an explicit extension dependency on vscode-yaml (#45) @JPinkney
* Fix typo in README.md (#46) @fgierlinger

## 0.3.0

* Added file associations for common files found on Ansible and Python repos
* Added schema verification for galaxy.yml files

## 0.2.0

* Add JSON schema for Zuul CI config files
* Add JSON schema for ansible-lint config files
* Add JSON schema for molecule scenarios
* Fix badge urls for marketplace

## 0.1.0

* Enable schema verification
* Fixed screenshot markdown image url
