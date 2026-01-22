// ui tests
"use strict";

module.exports = {
  bail: true,
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
  reporterOptions: {
    reporterEnabled: "spec,mocha-junit-reporter",
    mochaJunitReporterReporterOptions: {
      attachments: true,
      includePending: true,
      mochaFile:  `./out/junit/ui/${process.env.TEST_PREFIX ? process.env.TEST_PREFIX : 'ui' }-test-results.xml`,
      outputs: true,
      suiteTitle: "ui",
      suiteTitleSeparatedBy: "::",
    },
  },
};
