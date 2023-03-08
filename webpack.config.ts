"use strict";
const WarningsToErrorsPlugin = require("warnings-to-errors-webpack-plugin");

/* eslint @typescript-eslint/no-var-requires: "off" */
const path = require("path");

const config = {
  devtool: "source-map",
  entry: {
    client: "./src/extension.ts",
    server:
      "./node_modules/@ansible/ansible-language-server/out/server/src/server.js",
  },
  externals: {
    vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed
  },
  mode: "none",
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            // configure TypeScript loader:
            // * enable sources maps for end-to-end source maps
            // * does not work for server code
            loader: "ts-loader",
            options: {
              compilerOptions: {
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
  plugins: [new WarningsToErrorsPlugin()],
  resolve: {
    // support reading TypeScript and JavaScript files
    extensions: [".ts", ".js"],
  },
  stats: {
    errorDetails: true,
    moduleTrace: true,
    preset: "minimal",
  },
  target: "node", // vscode extensions run in a Node.js-context
};

module.exports = config;
