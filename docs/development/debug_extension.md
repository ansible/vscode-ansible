# Debugging

## Running and debugging the extension locally

The steps describe how to run the extension locally, set breakpoints in the
extension and the language serve code, and debug it:

### Step 1: Fork and clone

Fork and clone the vscode-ansible repository into your local environment. Set
the required remote URLs so that you can create PRs.

### Step 2: Compile

Run `pnpm install` in the root of the project (for the extension) and then run
it again after navigating to the packages/ansible-language-server directory.

Then, run `pnpm run compile` at both the levels.

### Step 3: Run Webpack dev

Navigate to the project root directory and run `pnpm run webpack-dev`.

!!! note

    In this mode, the source maps for the client point to the source of the client, while the sourcemaps for the server point to the JavaScript files of the ansible-language-server under node_modules.

### Step 4: Launch extension in debug mode

Launch the extension using the `Both` configuration. It opens an extension
development host window with the `examples` directory as root and the extension
activated.

!!! tip

    If the `Both` configuration does not work, launch the Launch Extension (webpacked) configuration, followed by the Attach to Server configuration.

### Step 5: Add breakpoints and debug

Set breakpoints in the code and/or make changes in the code and reload the
extension development host window to see the live changes.

## Cleaning the output

When you switch between debug and compilation modes, or if you have a
compilation or debugger problem, clean the output directory by running
`pnpm run clean`.
