<!-- markdownlint-disable no-duplicate-heading no-multiple-blanks -->

# Ansible Language Server Change Log

## v1.2.3

- No notable changes

## v1.2.1

### Bugfixes

- Fix `withInterpreter` issue (#594) @priyamsahoo

## v1.2.0

### Minor Changes

- Add support for playbook adjacent collections (#511) @priyamsahoo
- Use antsibull-docs-ts to render semantic markup (#563) @felixfontein

### Bugfixes

- Fix isPlaybook method (#590) @priyamsahoo
- Fix vars completion in task files (#589) @priyamsahoo
- Return URI instead of filepath (#560) @ajinkyau

## v1.1.0

### Minor Changes

- Update yaml to 2.x (#566) @priyamsahoo
- Add variable auto-completion feature when cursor inside jinja inline brackets
  (#552) @priyamsahoo

### Bugfixes

- Get module route for FQCN with more than 3 elements (#538) @fredericgiquel
- Replace sphinx with mkdocs (#544) @ssbarnea
- Modify package version info in meta-data (#530) @priyamsahoo
- Fix intermittent EE test failures (#533) @ganeshrn
- Fix github issue links in docs (#573) @antdking
- Fix ansible lint config parsing (#577) @priyamsahoo
- Add env variable to remove color from command result stdout (#579)
  @priyamsahoo

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
  @priyamsahoo #323

### Features

- Added EE settings for volume mounts, container options and pull arguments --
  by @ganeshrn

- Add setting to pass container image pull arguments #318

- Move `execution-environment.pull-policy` setting to
  `execution-environment.pull.policy`

## v0.6.1 (2022-04-14)

No significant changes.

## v0.6.0 (2022-04-12)

### Bugfixes

- Fixed indentation issue while resolving auto-completion items to support
  editors like vim and neovim -- by @yaegassy #285

- Fixed globby issue by replacing it with glob and writing utility function to
  support array of file patterns and file path exclusion patterns -- by
  @priyamsahoo #295

### Features

- Added auto-completion for values of module options and sub-options -- by
  @tomaciazek #288

- Refactored settings structure in the code to include descriptions and added
  utility for updating the settings doc to keep in sync with it -- by
  @priyamsahoo #294

### Miscellaneous

- Moved glob utils into a separate utils file and remove commented code -- by
  @ganeshrn #299

## v0.5.4 (2022-03-31)

### Bugfixes

- Fix auto-completion and hover not working with execution environment issue. --
  by @ganeshrn #279

### Features

- Implemented type based resolution for module options and sub-options
  completion -- by @priyamsahoo #276

## v0.5.3 (2022-03-16)

### Bugfixes

- Fixed intermittent issue with execution environment for auto-completion and
  hover by waiting for async function to copy plugins from within EE to local
  host cache --@ganeshrn. #263

### Features

- Enhanced the logic of ansible-lint service to do the following things by
  --@priyamsahoo:

- Fallback to `--syntax-check` in every failure scenarios (for eg. in case of
  wrong arguments passed, etc) and give visual feedback to the user in terms of
  notification about what went wrong.
- Handle different response types sent by ansible-lint (for e.g. ansible-lint
  sends failure reports as stdout and sometimes as errors) by making them
  uniform in terms of structure and redirection. #243

- Replaced the value `2^53 - 1 (which is Number.MAX_SAFE_INTEGER)` with
  `2^31 - 1 (which is integer.MAX_VALUE)` to support extension clients that do
  handle 64-bit floating point IEEE 754 number by --@priyamsahoo. #261

## v0.5.2 (2022-03-02)

### Bugfixes

- Used ls instead of find for execution-environments while check if ansible
  plugins are present in a given path -- by @ganeshrn #190
- Fixed source of `INVALID_URL` type error that occurred during the search for
  ansible-lint config file -- by {user} `priyamsahoo` #233

## v0.5.1 (2022-03-01)

### Bugfixes

- Ensure that Ansible calls do not return ANSI escapes, so we can parse them.
  [vscode-ansible#373] -- by @ssbarnea #236

[vscode-ansible#373]: https://github.com/ansible/vscode-ansible/issues/373

## v0.5.0 (2022-03-01)

### Features

- Emit notification about unsupported platforms -- by @ssbarnea #195

### Documentation

- Dropped the brackets from the changelog titles for the release sections. We
  now don't strictly follow the release notes format suggested by
  [Keep a Changelog](https://keepachangelog.com)-- by @webknjaz #164

- Replaced all the credits in the changelog with a dedicated Sphinx role -- by
  @webknjaz #165

### Miscellaneous

- Added changelog fragment management infrastructure using
  [Towncrier](https://github.com/twisted/towncrier) -- by @webknjaz #158 #198
  #201 #202 #204 #208 #210

- Added Sphinx documentation generator and set up the CI infrastructure for it
  -- by @webknjaz #161

- Added docs and references to the Community Code Of Conduct, security and
  contributing guides, and a pull request template -- by @webknjaz #163

- Fixed a half-baked change in the GitHub Actions CI/CD workflow job that is
  used in branch protection -- by @webknjaz #169

## v0.4.0 (2021-11-25)

### Bugfixes

- Prevented throwing an unhandled exception caused by undefined linter arguments
  settings (#142) @ssbarnea
- Implemented opening standalone Ansible files that have no workspace associated
  (#140) @ganeshrn

## v0.3.0 (2021-11-18)

### Minor Changes

- Added support for nested module options (suboptions) (#116) @tomaciazek
- Adopted use of `creator-ee` execution environment (#132) @ssbarnea
- Updated container cleanup logic for execution environment (#111) @ganeshrn

### Bugfixes

- Updated plugin doc cache validate logic for execution environment (#109)
  @ganeshrn
- Fixed issue with container copy command (#110) @ganeshrn

## v0.2.6 (2021-10-29)

### Bugfixes

- Fixed auto-completion to account for the builtin modules when used with EE
  (#94) @ganeshrn

## v0.2.5 (2021-10-23)

### Bugfixes

- Added a guard for linting only playbook files with the Ansible's built-in
  syntax-check when ansible-lint is unavailable. This is used for providing the
  diagnostics information (#89) @priyamsahoo

## v0.2.4 (2021-10-19)

### Major changes

The most notable changes that happened were:

- Renaming and publishing the package under the `@ansible` scope on Npmjs. The
  new name is `@ansible/ansible-language-server` now (#10) @webknjaz
- Deprecation of the initial `ansible-language-server` npm package that existed
  in the global namespace prior to the rename @ganeshrn
- Adding the auto-completion and diagnostics support for Ansible Execution
  Environments @ganeshrn

### Changes

- Started falling back to checking playbooks with the Ansible's built-in
  syntax-check when `ansible-lint` is not installed or disabled (#5)
  @priyamsahoo
- Set the minimum runtime prerequisites to `npm > 7.11.2` and `node >= 12` (#23)
  @ssbarnea
- Updated the default settings value to use fully qualified collection name
  (FQCN) during auto-completion (#37) @priyamsahoo
- Added auto-completion support for Ansible Execution Environments (#42 #54 #55)
  @ganeshrn
- Added diagnostics support for Ansible Execution Environments (#53) @ganeshrn
- Updated module completion return statement to support sorting as per FQCN
  (#57) @priyamsahoo

### Bugfixes

- Added a fix to check that the module paths are directories before globbing
  them during the documentation lookup (#38) @kimbernator
- Implemented documentation fragment discovery (#40) @tomaciazek
- Fixed sort `slice()` exception issue in `ansibleConfig` service (#76)
  @ssbarnea
- Fixed an issue with progress handling when `ansible-lint` falls back to
  `syntax check` (#88) @yaegassy

### Misc

- Replaced `decode`/`encodeURI` with a native VS Code mechanism (#8) @tomaciazek
- Implemented the release CD via `workflow_dispatch` (#65) @webknjaz

## v0.1.0-1 (2021-07-28)

- Updated the npm package to include the `out/` folder

## v0.1.0 (2021-07-28)

- Initial ansible language server release. Based on the `vscode-ansible` plugin
  developed by {user}`Tomasz Maciążek <tomaciazek>`
