# Chapter 8: Vite Webview development

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
