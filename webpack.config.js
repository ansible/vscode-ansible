//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

'use strict';
/* eslint @typescript-eslint/no-var-requires: "off" */
const path = require('path');

/** @type WebpackConfig */
const config = {
  mode: 'none',
  target: 'node', // vscode extensions run in a Node.js-context
  node: {
    __dirname: false, // leave the __dirname-behaviour intact
  },
  entry: {
    client: './src/extension.ts',
    server: './node_modules/@ansible/ansible-language-server/out/server/src/server.js',
  },
  output: {
    filename: (pathData) => {
      return pathData.chunk.name === 'client'
        ? '[name]/extension.js'
        : '[name]/src/[name].js';
    },
    path: path.resolve(__dirname, 'out'),
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: (info) => {
      return info.id === 'client'
        ? '../[resource-path]'
        : '../../../[resource-path]';
    },
  },
  // stats: 'verbose', // doesn't help with watcher
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed
  },
  resolve: {
    // support reading TypeScript and JavaScript files
    extensions: ['.ts', '.js'],
  },
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
            loader: 'ts-loader',
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
};

module.exports = config;
