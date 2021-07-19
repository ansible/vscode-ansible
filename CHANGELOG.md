# Change Log

All notable changes to the Ansible VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2021-07-19
### Fixed
- Modules from pre-installed Ansible collections will now be resolved when using
  the extension in an environment that also has Python 2 installed.
- The cause of the `invalid syntax` error shown on startup has been removed.

## [1.0.1] - 2021-07-15
### Fixed
- Documentation fragments are now also correctly processed in case only one is
  provided, using YAML flow style. The `file` module is a prominent example.

## [1.0.0] - 2021-07-14
- Initial release
