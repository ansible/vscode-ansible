//@ts-check

'use strict';

/* eslint @typescript-eslint/no-var-requires: "off" */
const withDefaults = require('../webpack.config');
const path = require('path');

module.exports = withDefaults({
  context: path.resolve(__dirname),
  entry: {
    extension: './src/extension.ts',
  },
  output: {
    filename: 'extension.js',
    path: path.resolve(__dirname, 'out'),
  },
});
