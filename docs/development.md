# Development

## Setting up development environment

A demo of the setup can be found [on youtube](https://youtu.be/LsvWsX7Mbo8).

It is recommended to work on the forked copy of this repository from your github
account to raise pull requests.

```bash
git clone git@github.com:<your-github-id>/ansible-language-server.git
cd ansible-language-server
git remote add upstream git@github.com:ansible/ansible-language-server.git
git fetch --all
git checkout -b <name_of_branch> upstream/main
```

## Running & debugging the language-server with VS Code

- Install dependent packages within ansible-language-server root directory

```console
ansible-language-server$ npm install .
```

This will install the dependent modules under `node_modules` folder within the
current directory.

- Clone the repository containing the VS Code extension code into the
  `vscode-ansible` directory _next to_ the root directory of this repository.

```bash
cd ..
git clone git@github.com:ansible/vscode-ansible.git
cd vscode-ansible
```

- Open a new VS Code window and add folder to workspace
  `File -> Add folder to workspace` and add `vscode-ansible` and
  `ansible-language-server` folders to the workspace

- Once the language server and `vscode-ansible/` directory is prepared, compile
  both client and server using command

```bash
npm run compile-withserver
```

- In the Run and debug window select **Client + Server (source)** configuration
  and start debugging `Run -> Start Debugging`. This will open up a new VS Code
  window which is the `Extension development Host` window.

- In the `Extension development Host` window add a new folder that has ansible
  files.

- You can set the ansible-language-server settings by adding
  `.vscode/settings.json` file under the root folder. Example settings:

```json
{
  "ansible.python.interpreterPath": "<change to python3 executable path>",
  "ansible.ansible.path": "<change to ansible executable path>",
  "ansibleServer.trace.server": "verbose"
}
```

## Cleaning the output

If you hit an odd compilation or debugger problem, don't hesitate to clean the
output directory by running `npm run clean` under the `vscode-ansible` folder.
You should also run it whenever you are switching between debug/compilation
modes.

### Building server locally

1. Install prerequisites:

   - latest [Visual Studio Code](https://code.visualstudio.com/)
   - [Node.js](https://nodejs.org/) v12.0.0 or higher

2. Fork and clone this repository

3. Install the dependencies

   ```bash
   cd ansible-language-server
   npm ci
   ```

4. Build the language server

   ```bash
   npm run compile
   ```

5. The newly built server is now located in `./out/server/src/server.js`.

   ```bash
   node ./out/server/src/server.js --stdio
   ```
