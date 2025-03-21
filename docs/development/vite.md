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
