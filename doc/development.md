# Development

To ease local development and testing, we use
[taskfile.dev](https://taskfile.dev/) but you can also call yarn directly for
most commands if you want.

To see all the commands available, run `task -l` and it will list all of them
along with their descriptions.

## Running & debugging the extension locally

There are multiple ways to run this extension in debug mode, depending on your
needs and setup. To run the default test suite, just run `task`.

### Debug with language server

In that mode, the code of the client is compiled and watched, while the language
server's code is copied from the `node_modules`. You'll be able to debug
JavaScript files under `out/server/src` and set breakpoints in them.

To run in this mode, you should first ensure that your code is compiled by
running `task build`. Then you may either launch the **Client + Server**
configuration or just **Launch Extension**.

### Debug with local language server source code

For this mode to work, you'll first need to clone the repository containing the
language server code into the `ansible-language-server` directory _next to_ the
root directory of this repository. Remember to `yarn install` in that directory.

Once the language server directory is prepared, you may compile both client and
server using the `yarn run compile-withserver` command. Then you may launch the
**Client + Server (source)** configuration.

### Debug a web-packed application

In rare cases, you might want to debug the application code compiled with
**webpack**. In this mode the source maps for the client point to the source of
the client, while the sourcemaps for the server point to the JavaScript files of
the `ansible-language-server` under `node_modules`.

To launch in this mode, first run webpack (`yarn run webpack-dev`). Then you may
launch the **Launch Extension (webpacked)** configuration, followed by the
**Attach to Server** configuration.

## Cleaning the output

If you hit an odd compilation or debugger problem, don't hesitate to clean the
output directory by running `yarn run clean`. You should also run it whenever
you are switching between debug/compilation modes.

## Marketplace admin interface

The current link to edit the extension presence on the marketplace is
<https://marketplace.visualstudio.com/manage/publishers/redhat>

## Package extension

```shell
task package
```

## Release and publication of extension

Any push made to the `main` branch will trigger an
[jenkins job](https://studio-jenkins-csb-codeready.apps.ocp-c1.prod.psi.redhat.com/job/ansible/job/vscode-ansible/)
that produces an artifact. The new version will be uploaded to
[marketplace.visualstudio.com](https://marketplace.visualstudio.com/) and
[open-vsx.org](https://open-vsx.org/) stores only when the pipeline is approved
by a core developer from Jenkins interface.

To be able to approve the release, you need to be login using kerberos, which is
documented on
[Red Hat IAM Wiki](https://source.redhat.com/groups/public/identity-access-management/identity__access_management_wiki/how_to_install_idm_client).
