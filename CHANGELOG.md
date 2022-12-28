<!-- markdownlint-disable no-duplicate-heading no-multiple-blanks -->

# Change Log

All notable changes to the Ansible VS Code extension will be documented in this
file.

[//]: # DO-NOT-REMOVE-versioning-promise-START

```{note}
The change notes follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
except for the title formatting, and this project adheres to [Semantic
Versioning](https://semver.org/spec/v2.0.0.html).
```

<!--
Do *NOT* manually add changelog entries here! This file is updated by
"task release" command run by our CI.
-->

<!-- KEEP-THIS-COMMENT -->

## v1.0.4

### Bugfixes

- Fix intermittent EE test failures (#533) @ganeshrn
- Modify package version info in meta-data (#530) @priyamsahoo

## v1.0.3

### Bugfixes

- Correct container name (#515) @ssbarnea
- Add note about task vs go-task (#509) @samccann
- Remove als acronym from docs website title (#507) @samccann
- Isolate container caching from others (#492) @ssbarnea
- Update docs url (#494) @ssbarnea
- Make node 14 minimal version required (#491) @ssbarnea
- Use ghcr.io instead of quay.io as default registry (#489) @ssbarnea

## v1.0.2

### Bugfixes

- Avoid parsing ansible-lint config file (#478) @priyamsahoo
- Enhance ansible meta-data (#475) @priyamsahoo
- Add support for ansible-lint config file (#474) @priyamsahoo

## v1.0.1

### Bugfixes

- Add documentation link for violated ansible-lint rules (#461) @priyamsahoo
- Support for FQCN with more than 3 elements (#449) @fredericgiquel
- Replace `which` with `command -v` (#463) @priyamsahoo

## v1.0.0

### Minor Changes

- Update settings to disable validation (#448) @priyamsahoo

### Bugfixes

- Fix bug related to diagnostics caching when validation is disabled (#451)
  @priyamsahoo

## v0.10.3

### Bugfixes

- pythonInfo: use python3 instead of python (#445) @clwluvw

## v0.10.2

### Bugfixes

- Fix 'handlers' keyword syntax highlighting and auto-completion (#440)
  @priyamsahoo
- Fix missing ansible-lint warning (#438) @priyamsahoo
- Replace `python` with `python3` in command execution (#430) @priyamsahoo

## v0.10.1

### Bugfixes

- Disable python debugger when running external commands (#420) @ssbarnea

## v0.10.0

### Minor Changes

- Expose metadata about environment to the client (#413) @priyamsahoo

### Bugfixes

- Fallback to default value if setting is not provided by client (#409)
  @fredericgiquel
- Bump ansible-compat from 2.1.0 to 2.2.0 in /.config (#408)
- Add handling of cases where lsp clients do not send required settings (#405)
  @yaegassy

## v0.9.0

### Minor Changes

- Add --version flag for ansible-language-server (#392) @yaegassy
- Auto-complete hosts values based on ansible inventory file (#350) @priyamsahoo

## v0.8.0

### Minor Changes

- Add settings for completion (#348) @fredericgiquel

### Bugfixes

- Fix documentation version reading (#363) @ssbarnea
- docs: add note on standalone usage (#347) @mtoohey31
- Refactor npm package (#356) @ssbarnea
- Bump ansible-lint from 6.2.2 to 6.3.0 (#346)
- Add check to validate mount path before passing it as an arg in EE (#345)
  @priyamsahoo

## v0.7.2 (2022-05-24)

### Bugfixes

- Fix auto-completion for modules when documentation is not displayed (#330)
  @fredericgiquel
- add ee service plugin path logs (#331) @ganeshrn

## v0.7.1 (2022-05-13)

No significant changes.

## v0.7.0 (2022-05-12)

### Bugfixes

- Fixed settings-doc-generator script to support array-type values -- by
  {user}`priyamsahoo`

  ({issue}`323`)

### Features

- ````md
  Added EE settings for volume mounts, container options and pull arguments --
  by {user}`ganeshrn`

  - Add settings to allow custom volume mount path eg:

  ```code
    "ansible.executionEnvironment.volumeMounts": [

         {
             "src" : "/Users/home/common/collections",
             "dest": "/Users/home/common/collections"
         }
     ],
  ```

  - Add setting to pass container options

  ```code
   "ansible.executionEnvironment.containerOptions": ["--net=host"]
  ```

  - Add setting to pass container image pull arguments

  ```code
  "ansible.executionEnvironment.pull.arguments": ["–-tls-verify=false"]
  ```

  - Move `execution-environment.pull-policy` setting to
    `execution-environment.pull.policy`
  ````

  ({issue}`318`)

## v0.6.1 (2022-04-14)

No significant changes.

## v0.6.0 (2022-04-12)

### Bugfixes

- Fixed indentation issue while resolving auto-completion items to support
  editors like vim and neovim -- by {user}`yaegassy`

  ({issue}`285`)

- Fixed globby issue by replacing it with glob and writing utility function to
  support array of file patterns and file path exclusion patterns -- by
  {user}`priyamsahoo`

  ({issue}`295`)

### Features

- Added auto-completion for values of module options and sub-options -- by
  {user}`tomaciazek`

  ({issue}`288`)

- Refactored settings structure in the code to include descriptions and added
  utility for updating the settings doc to keep in sync with it -- by
  {user}`priyamsahoo`

  ({issue}`294`)

### Miscellaneous

- Moved glob utils into a separate utils file and remove commented code -- by
  {user}`ganeshrn`

  ({issue}`299`)

## v0.5.4 (2022-03-31)

### Bugfixes

- ```md
  Fix auto-completion and hover not working with execution environment issue. --
  by {user}`ganeshrn`
  ```

  ({issue}`279`)

### Features

- Implemented type based resolution for module options and sub-options
  completion -- by {user}`priyamsahoo`

  ({issue}`276`)

## v0.5.3 (2022-03-16)

### Bugfixes

- Fixed intermittent issue with execution environment for auto-completion and
  hover by waiting for async function to copy plugins from within EE to local
  host cache --{user}`ganeshrn`.

  ({issue}`263`)

### Features

- Enhanced the logic of ansible-lint service to do the following things by
  --{user}`priyamsahoo`:

  - Fallback to `--syntax-check` in every failure scenarios (for eg. in case of
    wrong arguments passed, etc) and give visual feedback to the user in terms
    of notification about what went wrong.
  - Handle different response types sent by ansible-lint (for e.g. ansible-lint
    sends failure reports as stdout and sometimes as errors) by making them
    uniform in terms of structure and redirection.

  ({issue}`243`)

- Replaced the value `2^53 - 1 (which is Number.MAX_SAFE_INTEGER)` with
  `2^31 - 1 (which is integer.MAX_VALUE)` to support extension clients that do
  handle 64-bit floating point IEEE 754 number by --{user}`priyamsahoo`.

  ({issue}`261`)

## v0.5.2 (2022-03-02)

### Bugfixes

- Used ls instead of find for execution-environments while check if ansible
  plugins are present in a given path -- by {user}`ganeshrn`

  ({issue}`190`)

- Fixed source of `INVALID_URL` type error that occurred during the search for
  ansible-lint config file -- by {user} `priyamsahoo`

  ({issue}`233`)

## v0.5.1 (2022-03-01)

### Bugfixes

- Ensure that Ansible calls do not return ANSI escapes, so we can parse them.
  [vscode-ansible#373] -- by {user}`ssbarnea`

  [vscode-ansible#373]:
    https://github.com/ansible/vscode-ansible/issues/373
    "{issue}`236`"

## v0.5.0 (2022-03-01)

### Features

- Emit notification about unsupported platforms -- by {user}`ssbarnea`

  ({issue}`195`)

### Documentation

- Dropped the brackets from the changelog titles for the release sections. We
  now don't strictly follow the release notes format suggested by [Keep a
  Changelog][keepachangelog] -- by {user}`webknjaz`

  [keepachangelog]: https://keepachangelog.com/en/1.1.0/ "{issue}`164`"

- Replaced all the credits in the changelog with a dedicated Sphinx role -- by
  {user}`webknjaz`

  ({issue}`165`)

### Miscellaneous

- Added changelog fragment management infrastructure using
  [Towncrier][towncrier] -- by {user}`webknjaz`

  [towncrier]:
    https://github.com/twisted/towncrier
    "{issue}`158`, {issue}`198`, {issue}`201`, {issue}`202`,
{issue}`204`, {issue}`208`, {issue}`210`"

- Added [Sphinx][sphinx] documentation generator and set up the CI
  infrastructure for it -- by {user}`webknjaz`

  [sphinx]: https://github.com/twisted/towncrier "{issue}`161`"

- Added docs and references to the Community Code Of Conduct, security and
  contributing guides, and a pull request template -- by {user}`webknjaz`

  ({issue}`163`)

- Fixed a half-baked change in the GitHub Actions CI/CD workflow job that is
  used in branch protection -- by {user}`webknjaz`

  ({issue}`169`)

## v0.4.0 (2021-11-25)

### Bugfixes

- Prevented throwing an unhandled exception caused by undefined linter arguments
  settings (#142) {user}`ssbarnea`
- Implemented opening standalone Ansible files that have no workspace associated
  (#140) {user}`ganeshrn`

## v0.3.0 (2021-11-18)

### Minor Changes

- Added support for nested module options (suboptions) (#116) {user}`tomaciazek`
- Adopted use of `creator-ee` execution environment (#132) {user}`ssbarnea`
- Updated container cleanup logic for execution environment (#111)
  {user}`ganeshrn`

### Bugfixes

- Updated plugin doc cache validate logic for execution environment (#109)
  {user}`ganeshrn`
- Fixed issue with container copy command (#110) {user}`ganeshrn`

## v0.2.6 (2021-10-29)

### Bugfixes

- Fixed auto-completion to account for the builtin modules when used with EE
  (#94) {user}`ganeshrn`

## v0.2.5 (2021-10-23)

### Bugfixes

- Added a guard for linting only playbook files with the Ansible's built-in
  syntax-check when ansible-lint is unavailable. This is used for providing the
  diagnostics information (#89) {user}`priyamsahoo`

## v0.2.4 (2021-10-19)

### Major changes

The most notable changes that happened were:

- Renaming and publishing the package under the `@ansible` scope on Npmjs. The
  new name is `@ansible/ansible-language-server` now (#10) {user}`webknjaz`
- Deprecation of the initial `ansible-language-server` npm package that existed
  in the global namespace prior to the rename {user}`ganeshrn`
- Adding the auto-completion and diagnostics support for Ansible Execution
  Environments {user}`ganeshrn`

### Changes

- Started falling back to checking playbooks with the Ansible's built-in
  syntax-check when `ansible-lint` is not installed or disabled (#5)
  {user}`priyamsahoo`
- Set the minimum runtime prerequisites to `npm > 7.11.2` and `node >= 12` (#23)
  {user}`ssbarnea`
- Updated the default settings value to use fully qualified collection name
  (FQCN) during auto-completion (#37) {user}`priyamsahoo`
- Added auto-completion support for Ansible Execution Environments (#42 #54 #55)
  {user}`ganeshrn`
- Added diagnostics support for Ansible Execution Environments (#53)
  {user}`ganeshrn`
- Updated module completion return statement to support sorting as per FQCN
  (#57) {user}`priyamsahoo`

### Bugfixes

- Added a fix to check that the module paths are directories before globbing
  them during the documentation lookup (#38) {user}`kimbernator`
- Implemented documentation fragment discovery (#40) {user}`tomaciazek`
- Fixed sort `slice()` exception issue in `ansibleConfig` service (#76)
  {user}`ssbarnea`
- Fixed an issue with progress handling when `ansible-lint` falls back to
  `syntax check` (#88) {user}`yaegassy`

### Misc

- Replaced `decode`/`encodeURI` with a native VS Code mechanism (#8)
  {user}`tomaciazek`
- Implemented the release CD via `workflow_dispatch` (#65) {user}`webknjaz`

## v0.1.0-1 (2021-07-28)

- Updated the npm package to include the `out/` folder

## v0.1.0 (2021-07-28)

- Initial ansible language server release. Based on the `vscode-ansible` plugin
  developed by {user}`Tomasz Maciążek <tomaciazek>`
