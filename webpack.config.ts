"use strict";
import WarningsToErrorsPlugin from "warnings-to-errors-webpack-plugin";

import path from "path";

type EntryType = {
  client?: string;
  server?: string;
  // YAML syntax highlighter needs to be bundled with language/theme files at build
  syntaxHighlighter: string;
};

const entry: EntryType = {
  client: "./src/extension.ts",
  server: "./packages/ansible-language-server/src/server.ts",
  syntaxHighlighter: "./src/features/utils/syntaxHighlighter.ts",
};

const config = {
  devtool: "source-map",
  entry,
  externals: {
    vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed
    shiki: "shiki",
  },
  mode: "none",
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: [/node_modules/, /packages/],
        use: [
          {
            // configure TypeScript loader:
            // * enable sources maps for end-to-end source maps
            // * does not work for server code
            loader: "ts-loader",
            options: {
              compilerOptions: {
                configFile: "./tsconfig.json",
                sourceMap: true,
              },
            },
          },
        ],
        parser: {
          commonjsMagicComments: true, // enable magic comments support for CommonJS
        },
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        include: /packages/,
        use: [
          {
            // configure TypeScript loader:
            // * enable sources maps for end-to-end source maps
            // * does not work for server code
            loader: "ts-loader",
            options: {
              compilerOptions: {
                configFile: "./packages/ansible-language-server/tsconfig.json",
                sourceMap: true,
              },
            },
          },
        ],
      },
    ],
  },
  node: {
    __dirname: false, // leave the __dirname-behavior intact
  },
  plugins: [new WarningsToErrorsPlugin()],
  ignoreWarnings: [
    {
      // https://github.com/microsoft/vscode-languageserver-node/issues/1355
      message:
        /require function is used in a way in which dependencies cannot be statically extracted/,
    },
  ],
  output: {
    filename: (pathData: { chunk: { name: string } }) => {
      return pathData.chunk.name === "client"
        ? "[name]/src/extension.js"
        : "[name]/src/[name].js";
    },
    path: path.resolve(__dirname, "out"),
    libraryTarget: "commonjs2",
    devtoolModuleFilenameTemplate: (info: { id: string }) => {
      return info.id === "client"
        ? "../[resource-path]"
        : "../../../[resource-path]";
    },
  },
  resolve: {
    // support reading TypeScript and JavaScript files
    extensions: [".ts", ".js"],
  },
  stats: {
    errorDetails: true,
    moduleTrace: true,
    preset: "errors-warnings",
  },
  target: "node", // vscode extensions run in a Node.js-context
};

const webviewConfig = {
  ...config,
  target: ["web", "es2020"],
  entry: "./src/webview/apps/lightspeed/main.ts",
  experiments: { outputModule: true },
  output: {
    path: path.resolve(__dirname, "out"),
    filename: "./client/webview/apps/lightspeed/main.js",
    libraryTarget: "module",
    chunkFormat: "module",
  },
};

const contentCreatorMenuWebviewConfig = {
  ...config,
  target: ["web", "es2020"],
  entry: "./src/webview/apps/contentCreator/welcomePageApp.ts",
  experiments: { outputModule: true },
  output: {
    path: path.resolve(__dirname, "out"),
    filename: "./client/webview/apps/contentCreator/welcomePageApp.js",
    libraryTarget: "module",
    chunkFormat: "module",
  },
};

const playbookExplorerWebviewConfig = {
  ...config,
  target: ["web", "es2020"],
  entry: "./src/webview/apps/lightspeed/explorer/main.ts",
  experiments: { outputModule: true },
  output: {
    path: path.resolve(__dirname, "out"),
    filename: "./client/webview/apps/lightspeed/explorer/main.js",
    libraryTarget: "module",
    chunkFormat: "module",
  },
};

const playbookGenerationWebviewConfig = {
  ...config,
  target: ["web", "es2020"],
  entry: "./src/webview/apps/lightspeed/playbookGeneration/main.ts",
  experiments: { outputModule: true },
  output: {
    path: path.resolve(__dirname, "out"),
    filename: "./client/webview/apps/lightspeed/playbookGeneration/main.js",
    libraryTarget: "module",
    chunkFormat: "module",
  },
};

const playbookExplanationWebviewConfig = {
  ...config,
  target: ["web", "es2020"],
  entry: "./src/webview/apps/lightspeed/playbookExplanation/main.ts",
  experiments: { outputModule: true },
  output: {
    path: path.resolve(__dirname, "out"),
    filename: "./client/webview/apps/lightspeed/playbookExplanation/main.js",
    libraryTarget: "module",
    chunkFormat: "module",
  },
};

const createAnsibleCollectionWebviewConfig = {
  ...config,
  target: ["web", "es2020"],
  entry: "./src/webview/apps/contentCreator/createAnsibleCollectionPageApp.ts",
  experiments: { outputModule: true },
  output: {
    path: path.resolve(__dirname, "out"),
    filename:
      "./client/webview/apps/contentCreator/createAnsibleCollectionPageApp.js",
    libraryTarget: "module",
    chunkFormat: "module",
  },
};

const createAnsibleProjectWebviewConfig = {
  ...config,
  target: ["web", "es2020"],
  entry: "./src/webview/apps/contentCreator/createAnsibleProjectPageApp.ts",
  experiments: { outputModule: true },
  output: {
    path: path.resolve(__dirname, "out"),
    filename:
      "./client/webview/apps/contentCreator/createAnsibleProjectPageApp.js",
    libraryTarget: "module",
    chunkFormat: "module",
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
module.exports = (_env: any, argv: { mode: string }) => {
  // Use non-bundled js for client/server in dev environment
  if (argv.mode === "development") {
    delete config.entry.client;
    delete config.entry.server;
  }
  return [
    config,
    webviewConfig,
    contentCreatorMenuWebviewConfig,
    createAnsibleCollectionWebviewConfig,
    playbookExplorerWebviewConfig,
    playbookGenerationWebviewConfig,
    playbookExplanationWebviewConfig,
    createAnsibleProjectWebviewConfig,
  ];
};
