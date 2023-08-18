<!-- markdownlint-disable no-duplicate-heading -->

# Change Log

<!-- KEEP-THIS-COMMENT -->

## v2.7

### Bugfixes

- Fix var capturing regex (#955) @priyamsahoo

## v2.6

### Bugfixes

- Fix var capturing regex (#955) @priyamsahoo

## v2.5

### Minor Changes

- Upgrade als to v1.2.1 (#950) @priyamsahoo
- Add ability to select and set cursor on vars following `_var_` pattern (#884)
  @priyamsahoo
- Upgrade ALS to v1.1.0 (#932) @priyamsahoo
- Upgrade yaml package to 2.x (#925) @priyamsahoo

### Bugfixes

- Upgrade als to v1.2.1 (#950) @priyamsahoo
- Fix command runner (#949) @priyamsahoo
- Update lightspeed task name regex match condition (#947) (#948) @ganeshrn
- Fix ansibleContent feedback event trigger (#940) @ganeshrn
- Update runner.ts to correctly get the path of ansible (#945) @priyamsahoo
- Make hover e2e tests fixture messages more generic (#934) @priyamsahoo

## v2.4

### Minor Changes

- Lightspeed UI feedback and sentiment (#924) @ganeshrn

### Bugfixes

- Update readme with lightspeed section (#926) @ganeshrn

## v2.3

### Minor Changes

- Add support for tox-ansible plugin test discovery (#902) @ganeshrn

### Bugfixes

- Fix notification for lightspeed login after the setting is disabled (#911)
  @ganeshrn
- [Lightspeed] Fix connect button working (#908) @priyamsahoo

## v2.2

### Bugfixes

- Update attributionsWebview.ts (#901) @robinbobbitt

## v2.1

### Minor Changes

- Easy discovery of Python interpreter and Ansible executables (#871)
  @priyamsahoo

### Bugfixes

- Add information message for inline suggestion trigger command (#896) @ganeshrn
- Update status-bar items (#891) @priyamsahoo
- Update inline suggestion trigger condition (#892) @ganeshrn
- Add ability to select and set cursor on vars (#883) @priyamsahoo
- Add logic for conditional Authentication Provider registration (#877)
  @ganeshrn
- Fix regex to match trigger for lightspeed suggestion (#875) @ganeshrn
- Update dependencies (#872) @ssbarnea

## v2.0

### Major Changes

- Add support for Ansible Lightspeed settings to enable/disable the service,
  configure base URL and enable/disable Watson code assistant @ganeshrn
- Add support to authenticate with the Ansible Lightspeed service @priyamsahoo
- Add support for inline suggestion for Ansible tasks using Ansible Lightspeed
  with Watson code Assistant @ganeshrn
- Ansible Lightspeed panel support for displaying training matches for Watson
  Code Assistant @ganeshrn
- Ansible Lightspeed status bar support with link to survey @ganeshrn
- Add support to gather Ansible content data and sent it to Ansible Lightspeed
  service as feedback to improve the service @ganeshrn

### Minor Changes

- Update Ansible metadata event for enable/disable settings of Ansible
  Lightspeed (#853) @ganeshrn
- Update inline suggestion service name (#851) @ganeshrn
- Check for valid YAML for wisdom (#841) @ganeshrn
- Update wisdom survey link (#838) @ganeshrn
- To add the support for Ansible Lightspeed API versioning (#823) @justjais
- Add support for training source matches for inline suggestions (#827)
  @ganeshrn

### Bugfixes

- Fix to provide inline suggestions on click (#849) @ganeshrn
- Fix wisdom basePath empty/leading and trailing space issue (#843) @ganeshrn
- Improve message handling for status code 204 (#839) @ganeshrn
- More Project Wisdom renaming (#835) @elyezer
- Fix unnecessary call to feedback API (#834) @ganeshrn
- Add versioning for match API (#830) @ganeshrn
- Update wisdom base path (#829) @ganeshrn
- Show informational message when inline suggestion is empty (#828) @ganeshrn
- Update Project Wisdom Name (#826) @elyezer
- Minor OAuth fixes (#824) @priyamsahoo
- Downgrade Redhat telemetry package because of ES module incompatibility (#825)
  @priyamsahoo
- Inline suggestion improvements (#820)Co-authored-by: Ganesh Nalawade
  <ganesh634@gmail.com> (#820) @priyamsahoo
- Fix improper indentation while copying (#821) @priyamsahoo
- To fix Ansible wisdom basepath empty url issue (#816) @justjais
- Ignore errors from feedback API (#810) @ganeshrn

## v1.3

### Minor Changes

- Show info in status-bar if a newer version of ansible-lint is available (#692)
  @priyamsahoo
- Add code changes for inline suggestion [part-1] (#766) @ganeshrn

### Bugfixes

- Fix onEnter key bindings to work with ansible extension only (#772) @ganeshrn
- Fix devel testing (#777) @ssbarnea
- Add fix to remove prompt from suggestion (#770) @ganeshrn
- Upgrade telemetry to 0.5.4 (#751) @ssbarnea
- Add tsdoc to eslint (#747) @ssbarnea
- Switch from quay.io to ghcr.io (#744) @ssbarnea

## v1.2

### Minor Changes

- Show info in status-bar if a newer version of ansible-lint is available (#692)
  @priyamsahoo
- Add code changes for inline suggestion [part-1] (#766) @ganeshrn

### Bugfixes

- Fix onEnter key bindings to work with ansible extension only (#772) @ganeshrn
- Fix devel testing (#777) @ssbarnea
- Add fix to remove prompt from suggestion (#770) @ganeshrn
- Upgrade telemetry to 0.5.4 (#751) @ssbarnea
- Add tsdoc to eslint (#747) @ssbarnea
- Switch from quay.io to ghcr.io (#744) @ssbarnea

## v1.1

### Minor Changes

- Add Red Hat telemetry gathering (#732) @ganeshrn
- Reuse terminal setting (#689) @egnirra
- Enhance ansible metadata and Bump ALS version from 1.0.1 to to 1.0.2 (#677)
  @priyamsahoo
- Add event driven schema for autocompletion and diagnostics of EDA rules (#673)
  @ganeshrn

### Bugfixes

- Upgrade ALS to 1.0.4 (#733) @priyamsahoo
- Update location of ansible schemas (#705) @ssbarnea
- Fix broken pipe error in test-setup.sh (#693) @priyamsahoo
- Update search paths for ansible.cfg based on the documentation (#691)
  @priyamsahoo
- Enables reuse of existing ansible terminals (#683) @egnirra
- Enhance ansible metadata and Bump ALS version from 1.0.1 to to 1.0.2 (#677)
  @priyamsahoo
- Missing `ansible.completion.*` configuration (#663) @yaegassy
- Refresh status-bar title and content when extension settings are changed
  (#662) @priyamsahoo

## v1.0.0

### Minor Changes

- Add support to run ansible-navigator with execution environment (#652)
  @ganeshrn
- Update the extension to support disabling diagnostics (#648) @priyamsahoo

### Bugfixes

- Improve description of configuration options (#649) @priyamsahoo
- Update ALS version to 1.0.1 (#656) @priyamsahoo
- Use creator-ee v0.9.2 to fix CI failures (#653) @priyamsahoo
- Update ansible-lint and version and e2e-tests to support changes the changes
  (#643) @priyamsahoo
- More refactor for ansible metadata feature (#641) @ganeshrn
- Refactor extension.ts (#635) @priyamsahoo
- Switch to new location of Molecule JSON Schema (#637) @ssbarnea

## v0.14.0

### Minor Changes

- Add auto-detection of Ansible files based on their content (#617) @priyamsahoo

### Bugfixes

- Update ALS to 0.10.3 (3 bugs) (#632) @ssbarnea
- Bump vscode-languageclient from 7.x to 8.x (#626) @ajinkyau
- Change extension status-bar icon (#627) @ssbarnea
- fix hyphenation README (#611) @akira6592

## v0.13.0

### Minor Changes

- Add feature to dynamically associate yaml files to `ansible` language (#600)
  @priyamsahoo

### Bugfixes

- Use new location of ansible-lint config JSON Schema (#608) @ssbarnea
- Fix the display of double `Ansible` in status-bar text (#605) @priyamsahoo
- Disable python debugger when running external commands (#603) @ssbarnea

## v0.12.0

### Minor Changes

- Allow jinja brace autocompletion (#593) @ganeshrn
- Add feature to show ansible meta data (#586) @priyamsahoo

### Bugfixes

- Update test dependencies (#577) @ssbarnea
- Update ansible-language-server (#574) @ssbarnea

### Bugfixes

- Update ansible-language-server to 0.9.0 (#548) @ssbarnea

## v0.11.0

### Minor Changes

- Add command to re-sync ansible inventory file (#522) @priyamsahoo
- Require vscode 1.63 or newer (November 2021) (#567) @ssbarnea

### Bugfixes

- Update ansible-language-server to 0.9.0 (#548) @ssbarnea

## 0.10.0

### Minor Changes

- Add EE settings for volume mounts, container options and pull arguments (#499)
  @ganeshrn

### Bugfixes

- Upgrade ansible-language-server to 0.7.2 (#506) @ssbarnea
- Fix auto-completion for modules when documentation is not displayed
  ([ansible/ansible-language-server#330](https://github.com/ansible/ansible-language-server/pull/330))
  @fredericgiquel
- add ee service plugin path logs
  ([ansible/ansible-language-server#331](https://github.com/ansible/ansible-language-server/pull/331))
  @ganeshrn

## 0.9.0

### Minor Changes

- Add e2e test-cases for execution-environment (#459) @ganeshrn
- Change client extension entry point (#461) @ganeshrn

### Bugfixes

- Update URL of external resources (#480) @ssbarnea
- Remove Zuul schema definition from extension config (#470) @ssbarnea
- Fix e2e testing (#469) @priyamsahoo

## 0.8.1

## Bugfixes

- Add language configuration files in vsix package (#454) @ganeshrn

## 0.8.0

## Minor Changes

- Update ansible-language-server version (#434) @ganeshrn
- Add support for meta/runtime.yml and execution-environment.yml (#379)
  @ssbarnea
- Add schema for ansible-navigator configuration (#365) @ssbarnea

## Bugfixes

- Restore webpack archive (#437) @ssbarnea
- Fix jsonValidation and yamlValidation extension point (#432) @yaegassy
- Fix extension broken debug capability (#431) @ganeshrn
- Declare lextudio.restructuredtext ext as conflicting (#366) @ssbarnea

## 0.7.1

### Bugfixes

- Fixed inline encryption of multiline strings (#337) @jeinwag
- Prevented throwing an unhandled exception caused by the undefined linter
  arguments settings
  ([ansible/ansible-language-server#142](https://github.com/ansible/ansible-language-server/pull/142))
  @ssbarnea
- Implemented opening standalone Ansible files that have no workspace associated
  ([ansible/ansible-language-server#140](https://github.com/ansible/ansible-language-server/pull/140))
  @ganeshrn

## 0.7.0

### Removals

- Dropped the option to configure ansible-vault path (#318) @ssbarnea
- Dropped the option to configure ansible-playbook location (#317) @ssbarnea

### Minor Changes

- Upgraded the `@ansible/ansible-language-server` dependency to 0.3.0 (#333)
  @ssbarnea
  - Added support for nested module options (suboptions) @tomaciazek
  - Updated container cleanup logic for execution environment @ganeshrn
- Switched the default execution environment to `ansible/creator-ee:latest`
  (#331) @ganeshrn @ssbarnea
- Enabled auto-selection of the only vault-id (#298) @jeinwag

### Bugfixes

- Corrected some unspecified configurable settings (#307) @ssbarnea
- Started invoking inactive extension when running ansible-vault (#296) @jeinwag

### Documentation

- Documented the need to have an open workspace for the extension to work
  @ssbarnea

## 0.6.1

### Bugfixes

- Fix indentation when using inline vault encrypt (#288) @jeinwag

## 0.6.0

### Minor Changes

- **Feature**: Restored client-side support for working with ansible vaults
  (#177) @jeinwag
- Exposed the `ansibleServer.trace.server` option for tracing language server
  activity (#263) @yaegassy
- Upgraded language server to 0.2.6 (#284) @ssbarnea

### Bugfixes

- Fixed autocompletion of the built-in modules with EE
  (ansible/ansible-language-server#94) @ganeshrn
- Corrected `pullPolicy` setting type to string (#279) @ganeshrn
- Enabled editor suggestions for `ansible` files by default (#274) @ssbarnea

## 0.5.1

### Hotfixes

- Increased the minimum required `@ansible/ansible-language-server` version to
  0.2.5. It has added a guard for linting only playbook files with the Ansible's
  built-in syntax-check when `ansible-lint` is unavailable. This is used for
  providing the diagnostics information to the client (VS Code editor instance)
  (#259) @ganeshrn

## 0.5.0

### Major changes

The most notable change that happened was the migration to using
`@ansible/ansible-language-server` v0.2.4 via PR #142 by @tomaciazek. In
particular, this:

- Added the brand new Ansible Language Server
- Removed the support for working with the vaulted content

### Changes

- Decreased the minimal required version of VS Code to v1.48.0 (July 2020)
  (#206) @ssbarnea
- Added setting options for working with execution environments (#200) @ganeshrn
- Added a prompt to uninstall incompatible extensions (#170) @ssbarnea
- Updated the default setting value to use FQCN in autocompletion (#196)
  @priyamsahoo
- Added context menus and commands for running playbooks via `ansible-playbook`
  and `ansible-navigator run` (#137) @webknjaz

### Misc

- Made sure that the path-related settings are not being synchronized (#235)
  @ssbarnea
- Reintroduced the schema verification for the part of the known file paths
  that's been lost with the initial introduction of ansible language server in
  extension (#169) @ssbarnea
- Stopped including the unused files to vsix artifacts (#239) @ssbarnea
- Switched the debug listening port for ansible language server in the
  development mode to `6010` effectively fixing the support for unbound
  breakpoints when coding two connected projects (#212) @tomaciazek

### Docs

- Added a link to the language server repository into README (#173) @ganeshrn
- Added descriptions for the configuration settings section in README (#242)
  @ganeshrn

## 0.4.5

- Clean old violations when running the linter again

## 0.4.4

- Revalidate documents on save (#95) @ssbarnea

## 0.4.3

- Auto-add missing Ansible YAML tags like `!vault`
- Recognize Ansible files using `.yaml` extension in addition to `.yml`

## 0.4.2

- Reduce minimal version of vscode that is required (#90) @ssbarnea

## 0.4.0

- Added vaults encryption and decryption support via `ansible-vault` command
  (#78) @FlorianLaunay

## 0.3.2

- Use ansible-lint severity for VSCode diagnostics (#68) @FloSchwalm
- Match found problems to source files (#70) @FloSchwalm
- docs: added instructions on how to integrate `ansible-lint` in venv w… (#67)
  @stopendy

## 0.3.1

- docs: mention YAML tags configuration (#61) @ssbarnea
- [pre-commit.ci] pre-commit autoupdate (#55) @pre-commit-ci
- feat: add logging information (#62) @ssbarnea
- fix: advertise Microsoft Python extension as required (#54) @ssbarnea
- Create LICENSE (#52) @ssbarnea
- chore: fix pre-commit eslint dependencies (#53) @ssbarnea
- Add an explicit extension dependency on vscode-yaml (#45) @JPinkney
- Fix typo in README.md (#46) @fgierlinger

## 0.3.0

- Added file associations for common files found on Ansible and Python repos
- Added schema verification for galaxy.yml files

## 0.2.0

- Add JSON schema for Zuul CI config files
- Add JSON schema for ansible-lint config files
- Add JSON schema for molecule scenarios
- Fix badge urls for marketplace

## 0.1.0

- Enable schema verification
- Fixed screenshot markdown image url
