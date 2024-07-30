# Chapter 5: Developing and debugging the extension

To ease local development and testing, we use
[taskfile.dev](https://taskfile.dev/) but you can also call yarn directly for
most commands if you want.

To see all the commands available, run `task -l` and it will list all of them
along with their descriptions.

## Running and debugging the extension locally

The following are the steps you need to follow in order to run the extension
locally, set breakpoints (both, in the extension and the language serve code)
and debug it:

### Step 1: Fork and clone

Fork and clone the vscode-ansible repository into your local environment. Make
sure to to set required remote urls in order to make PRs.

### Step 2: Compile

Run `yarn install` in the root of the project (for the extension) and then run
it again after navigating inside the packages/ansible-language-server directory.

Then, run `yarn run compile` at both the levels.

### Step 3: Run Webpack dev

Navigate back to the root of the project and run `yarn run webpack-dev`.

!!! note

    In this mode the source maps for the client point to the source of the client, while the sourcemaps for the server point to the JavaScript files of the ansible-language-server under node_modules.

### Step 4: Launch extension in debug mode

Launch the extension using `Both` configuration. It will open a extension
development host window with `examples` directory as root and the extension
activated.

!!! tip

    In rare cases, if the `Both` configuration does not work,launch the Launch Extension (webpacked) configuration, followed by the Attach to Server configuration.

### Step 5: Add breakpoints and debug

Finally, set breakpoints in the code and/or make changes in the code and reload
the extension development host window to see the live changes.

## Cleaning the output

If you hit an odd compilation or debugger problem, don't hesitate to clean the
output directory by running `yarn run clean`. You should also run it whenever
you are switching between debug/compilation modes.
