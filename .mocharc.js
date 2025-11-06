// Used only by 'unit' tests
// 'e2e' is configured via .vscode-test.mjs
// 'ui' is configured via test/ui/.mocharc.js
"use strict";

module.exports = {
  color: true, // needed to keep colors inside vscode terminal
  recursive: true,
  extension: ["ts"],
  require: [
    "ts-node/register",
    "./test/mochaHooks.ts", // # this file must be loaded last
  ],
  package: "package.json",
  timeout: 30003, // default is 2000
  // most UI tests are >22s due to our current wait times and we do not want
  // red slow marker to distract us until we sort that part yet. Red is expected
  // to appear on unexpected long tests, not on an expected duration.
  slow: 25000,
  reporter: "mocha-multi-reporters",
  reporterEnabled: "spec,mocha-junit-reporter",
  "reporter-options": `configFile=${__filename}`,
  mochaJunitReporterReporterOptions: {
    attachments: true,
    includePending: true,
    mochaFile: `./out/junit/unit/${process.env.TEST_ID ?? "unit"}-test-results.xml`,
    outputs: true,
    suiteTitle: "unit",
    suiteTitleSeparatedBy: "::",
  },
};
