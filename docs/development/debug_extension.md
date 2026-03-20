# Debugging

## Running and debugging the extension locally

The steps describe how to run the extension locally, set breakpoints in the
extension and the language serve code, and debug it:

### Step 1: Fork and clone

Fork and clone the vscode-ansible repository into your local environment. Set
the required remote URLs so that you can create PRs.

### Step 2: Compile

Run `yarn install` in the root of the project (for the extension) and then run
it again after navigating to the packages/ansible-language-server directory.

Then, run `yarn run compile` at both the levels.

### Step 3: Launch extension in debug mode

Launch the extension using the `Both` configuration. It opens an extension
development host window with the `examples` directory as root and the extension
activated.

!!! tip

    If the `Both` configuration does not work, launch the Launch Extension (packed) configuration, followed by the Attach to Server configuration.

### Step 4: Add breakpoints and debug

Set breakpoints in the code and/or make changes in the code and reload the
extension development host window to see the live changes.

## Cleaning the output

When you switch between debug and compilation modes, or if you have a
compilation or debugger problem, clean the output directory by running
`yarn run clean`.
