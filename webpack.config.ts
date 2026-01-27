import WarningsToErrorsPlugin from "warnings-to-errors-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";

import path from "path";
const webpack = require("webpack");

type EntryType = {
  server?: string;
};

const entry: EntryType = {
  server: "./packages/ansible-language-server/src/server.ts",
};

const config = {
  cache: {
    type: "filesystem",
    buildDependencies: {
      config: [__filename],
    },
  },
  devtool: "source-map",
  entry,
  externals: {
    vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed
    shiki: "shiki",
  },
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
        include: /packages\/ansible-mcp-server/,
        use: [
          {
            // configure TypeScript loader for MCP server:
            // * enable sources maps for end-to-end source maps
            // * uses ESNext modules (different from language server)
            loader: "ts-loader",
            options: {
              compilerOptions: {
                configFile: "./packages/ansible-mcp-server/tsconfig.json",
                sourceMap: true,
              },
            },
          },
        ],
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        include: /packages\/ansible-language-server/,
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
      {
        // Handle ES modules in node_modules (specifically @vscode-elements/elements)
        test: /\.js$/,
        include: /node_modules\/@vscode-elements\/elements/,
        type: "javascript/esm",
        resolve: {
          fullySpecified: false,
        },
      },
    ],
  },
  node: {
    __dirname: false, // leave the __dirname-behavior intact
  },
  plugins: [
    new WarningsToErrorsPlugin(),
    new webpack.IgnorePlugin({
      resourceRegExp: /^electron$/,
    }),
    new CopyPlugin({
      patterns: [
        {
          from: "packages/ansible-mcp-server/src/resources/data/*.{md,json,yml}",
          to: "mcp/data/[name][ext]",
        },
      ],
    }),
  ],
  ignoreWarnings: [
    {
      // https://github.com/microsoft/vscode-languageserver-node/issues/1355
      message:
        /require function is used in a way in which dependencies cannot be statically extracted/,
    },
  ],
  output: {
    filename: (pathData: { chunk: { name: string } }) => {
      if (pathData.chunk.name === "client") {
        return "[name]/src/extension.js";
      }
      return "[name]/src/[name].js";
    },
    path: path.resolve(__dirname, "out"),
    devtoolModuleFilenameTemplate: "../[resource-path]", // relative to 'path'
    libraryTarget: "commonjs2",
  },
  resolve: {
    // support reading TypeScript and JavaScript files
    extensions: [".ts", ".js"],
    // Handle ESM imports with .js extension in TypeScript files
    // When TypeScript files import with .js extension, resolve to .ts files
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
  stats: {
    errorDetails: true,
    moduleTrace: true,
    preset: "errors-warnings",
  },
  target: "node", // vscode extensions run in a Node.js-context
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
module.exports = (_env: any, argv: { mode: string }) => {
  // Use non-bundled js for client/server in dev environment
  if (argv.mode === "development") {
    delete config.entry.server;
  }
  return [config];
};
