# Testing

Tests for the extension and the language server are stored separately in their
respective directories inside the `test` sub-folders.

Throughout the project and for all types of tests, there are:

1. **Test fixtures:** Settings and Ansible files against which the tests are
   run.
2. **Test scripts:** the actual test code.

## Extension tests

There are three types of tests for the extension:

1. **Unit tests:** Check various functions used across the extension.
2. **End-to-end (e2e) tests:** Test the entire user flow. They open a test host
   of the extension, run the whole workflow from launching the extension,
   loading Ansible files in the editor, activating the language server, using
   the language features, and asserting the outcome.
3. **UI tests:** Check the presence and functionality of various UI elements in
   the VS Code interface, from the status bar and activity bar to web-views and
   terminal views.
4. **UI-Selenium tests:** Similar to the UI tests, but they run in a `code-server`
   (a.k.a VSCode in a Webbrowser) instance embedded in a container. The web browser
   is Firefox and the interactions are handled by Selenium.
   Some tests require a secret. You cannot run them locally.

## Language server tests

The language server has only unit tests in its directory, as the end-to-end
testing is already covered by the extension's e2e tests. For each provider
(language feature), there is a test file that tests the functionality of the
language feature.

## Running the Tests

Each type of test has its own script and can be run by `task <command>`:

### Extension test scripts

1. `task unit`: Runs the unit tests for the extension.
2. `task e2e`: Runs the end-to-end tests for the extension.
3. `task ui`: Runs the UI tests on the latest version of VS Code
   against the code packaged as a `.vsix` file.
4. `task ui-oldest`: Runs the UI tests on the oldest supported version of VS
   Code against the code packaged as a `.vsix` file.
5. `task ui-selenium`: Runs the Selenium-based UI tests.

!!! tip

    To run a single UI test case, you can use `MOCHA_GREP` environment variable as follows:

    `MOCHA_GREP="your test case name in describe statement" yarn ui-current`

### Language server test scripts

For the language server tests, navigate to the root of the
`ansible-language-server` directory and then run the script:

1. **test-with-ee:** Runs the language server unit tests in an execution
   environment.
2. **test-without-ee:** Runs the language server unit tests in a normal
   environment.
3. **test:** Runs the language server unit tests in both the environments one
   after the other.

## Coverage

- [c8] is recommended in favor of the older [nyc] for coverage reporting.
- [codecov.io] coverage reports should use `cobertura` format, as it proves to
  be more reliable than the `lcovonly` format, which has weird problems with
  processing.
- [codecov.io] unit-test reports should use junit-format
- [mocha] natively supports just one reporter, and we recommend setting it to
  [mocha-junit-reporter] as coverage can be achieved by using [c8] as a runner.
- Use `branches` percentage for coverage check as it is more reliable than
  `lines`, `statements` or `functions` percentage, especially when refactoring
  the code, causing far less false positive results.

[c8]: https://www.npmjs.com/package/c8
[nyc]: https://www.npmjs.com/package/nyc
[codecov.io]: https://codecov.io/
[mocha-junit-reporter]: https://www.npmjs.com/package/mocha-junit-reporter
[mocha]: https://mochajs.org/
