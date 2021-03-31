//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

'use strict';
/* eslint @typescript-eslint/no-var-requires: "off" */
const path = require('path');
const merge = require('merge-options');

module.exports = function withDefaults(/**@type WebpackConfig*/ extConfig) {
  /** @type WebpackConfig */
  let defaultConfig = {
    mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
    target: 'node', // vscode extensions run in a Node.js-context
    node: {
      __dirname: false, // leave the __dirname-behaviour intact
    },
    entry: './client/src/extension.ts',
    output: {
      filename: '[name].js',
      path: path.resolve(extConfig.context, 'dist'),
      libraryTarget: 'commonjs2',
      devtoolModuleFilenameTemplate: '../[resource-path]',
    },
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

  return merge(defaultConfig, extConfig);
};
