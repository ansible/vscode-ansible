# Vite Webview development

Some views relies on Vite to be built. As a developer, you need first to:

- run `yarn run webpack`, this way the extension will be able to start
- then you can run the Extension with the `Debug Extension (Vite)`
  configuration.

In the nested VSCode, your extension will benefit from the live reloading. If
you apply a change, the webview should visually reflect it dynamically. Time to
time, the live reloading may get confused by some large chunk of broken code
(e.g: you have a missing lib). You just need to close the Webview tab and reopen
it.

Live reloading won't work for changes that impact the `onDidReceiveMessage`
callbacks (extension side). These parts not handle by Vite itself and require a
restart of the nested VSCode.

When the `vite dev` process is running, you can also point your browser on the
Live rendering, e.g:
`http://localhost:5173/webviews/lightspeed/role-generation.html`. Adjust the
port to match your local configuration, it may be `5174`.

In some occasion, the Live Reloading may not work, you can manually kill the
`vite-dev Task`, clean up the `out/vitebuild/` directory and restart the
`Debug Extension (Vite)` session.

## How to bootstrap a new Webview

### The ViteJs App page

Copy the following example files to match the name of your new webview:

- `webviews/lightspeed/src/HelloWorld.vue`
- `webviews/lightspeed/src/hello-world.ts`, adjust the following line:

  ```html
  import App from "./HelloWorld.vue";
  ```

- `webviews/lightspeed/hello-world.html`, adjust the

  ```html
  <script type="module" src="./src/hello-world.ts"></script>
  ```

- Now you need to register your new VueJs file in the `vite.config.ts`, this way
  the page will be render when `yarn vite-build` is called.

At this stage, the ViteJs side is ready and you should be able to call
`yarn vite-dev` and you should get an output similar too this:

```console
  VITE v6.3.5  ready in 542 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
18:36:40 [tomjs:vscode] extension build success
```

Open a Webbrowser and point to
<http://localhost:5173/webviews/lightspeed/hello-world.html> adjust the port and
the HTML page location to match your new VueJs vue. You should see an Hello
World banner.

These copied files will likely trigger a Duplicated Lines error in SonarCloud,
you can turn the check off by listing them in the `.sonarcloud.properties` file.

### Integration within VSCode

- Copy `src/features/lightspeed/vue/views/helloWorld.ts` and adjust the name of
  the App.
- Then Edit `src/extension.ts`, to import the new module:

  ```typescript
  import { MainPanel as HelloWorldPanel } from "./features/lightspeed/vue/views/helloWorld";
  ```

  and register your new command, e.g:

  ```typescript
  context.subscriptions.push(
    vscode.commands.registerCommand("ansible.hello.world", async () => {
      HelloWorldPanel.render(context);
    }),
  );
  ```

- Finally, you need to register the new command in the `package.json` file, e.g:

  ```json
  {
    "command": "ansible.hello.world",
    "title": "Ansible: Demo Vue - Hello World"
  }
  ```
