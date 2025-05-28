// ui tests
"use strict";

module.exports = {
  color: true, // needed to keep colors inside vscode terminal
  recursive: true,
  extension: ["ts"],
  require: ["ts-node/register"],
  package: "../../package.json",
  timeout: 30003, // default is 2000
  // most UI tests are >22s due to our current wait times and we do not want
  // red slow marker to distract us until we sort that part yet. Red is expected
  // to appear on unexpected long tests, not on an expected duration.
  slow: 25000,
  reporter: "mocha-multi-reporters",
  reporterEnabled: "spec,mocha-junit-reporter",
  "reporter-options": `configFile=${__filename}`,
  mochaJunitReporterReporterOptions: {
    mochaFile: `./out/junit/${process.env.TEST_ID ?? "ui-"}-test-results.xml`,
    includePending: true,
    outputs: true,
    suiteTitle: "ui",
  },
};
