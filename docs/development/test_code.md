# Chapter 4: Understanding testing style and structure

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

## Language server tests

The language server has only unit tests in its directory, as the end-to-end
testing is already covered by the extension's e2e tests. For each provider
(language feature), there is a test file that tests the functionality of the
language feature.

## Running the Tests

Each type of test has its own script and can be run by `yarn run <script-name>`:

!!! tip

    Always run `yarn run compile` before running the tests.

### Extension test scripts

1. **unit-tests:** Runs the unit tests for the extension.
2. **test-e2e:** Runs the end-to-end tests for the extension.
3. **test-ui-current:** Runs the UI tests on the latest version of VS Code
   against the code packaged as a `.vsix` file.
4. **test-ui-oldest:** Runs the UI tests on the oldest supported version of VS
   Code against the code packaged as a `.vsix` file.
5. **coverage-ui-current:** Runs the UI tests on the latest version of VS Code
   by loading the `.js` files.
6. **coverage-ui-oldest:** Runs the UI tests on the oldest supported version of
   VS Code by loading the `.js` files.

!!! note

    For `test-ui*` scripts, you must package and build a `.vsix file` of the extension by running `yarn run package`. As you run the UI tests, the .vsix file is automatically installed and the UI elements are checked.

!!! tip

    In case of debugging, use `coverage-ui*` script for running UI tests. Make sure to compile the sources with:

    `yarn webpack-dev`

    To run a single UI test case, you can use `MOCHA_GREP` environment variable as follows:

    `MOCHA_GREP="your test case name in describe statement" yarn coverage-ui-current`

### Language server test scripts

For the language server tests, navigate to the root of the
`ansible-language-server` directory and then run the script:

1. **test-with-ee:** Runs the language server unit tests in an execution
   environment.
2. **test-without-ee:** Runs the language server unit tests in a normal
   environment.
3. **test:** Runs the language server unit tests in both the environments one
   after the other.
