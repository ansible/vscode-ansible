# Development

## Running & debugging the extension locally

There are multiple ways to run this extension in debug mode, depending on
your needs and setup.

### Debug with language server from *npm*

In that mode, the code of the client is compiled and watched, while the language
server's code is copied from the `node_modules`. You'll be able to debug
JavaScript files under `out/server/src` and set breakpoints in them.

To run in this mode, you should first ensure that your code is compiled by
running `npm run compile`. Then you may either launch the **Client + Server**
configuration, or just **Launch Extension**.

### Debug with local language server source code

For this mode to work, you'll first need to clone the repository containing the
language server code into the `ansible-language-server` directory *next to* the
root directory of this repository. Remember to `npm install` in that directory.

Once the language server directory is prepared, you may compile both client and
server using the `npm run compile:withserver` command. Then you may launch the
**Client + Server (source)** configuration.

### Debug a web-packed application

In rare cases, you might want to debug the application code compiled with
**webpack**. In this mode the source maps for the client point to the source of
the client, while the sourcemaps for the server point to the JavaScript files of
the `ansible-language-server` under `node_modules`.

To launch in this mode, first run webpack (`npm run webpack:dev`). Then you may
launch the **Launch Extension (webpacked)** configuration, followed by the
**Attach to Server** configuration.

## Cleaning the output

If you hit an odd compilation or debugger problem, don't hesitate to clean the
output directory by running `npm run clean`. You should also run it whenever you
are switching between debug/compilation modes.

## Marketplace admin interface

The current link to edit the extension presence on the marketplace is
<https://marketplace.visualstudio.com/manage/publishers/redhat>

## Package extension

```shell
vsce package
```

## Publish extension

Obviously that you need to be able to publish, likely you will
need to run `vsce login redhat` first (needs publisher name).

```shell
vsce publish
```

As it is likely that you are not logged in or your PAT is expired, the magic
url to visit to regenerate one should be something like:

<https://dev.azure.com/USERNAME/_usersSettings/tokens>

When creating a PAT, the Scopes needed are Marketplace Acquire + Publish.

The funny bit is you need to give access to "All organizations" because
the only organization listed there was "myuser", which produced a token
that gave 401 (access denied).
