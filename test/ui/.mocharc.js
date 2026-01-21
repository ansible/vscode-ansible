// ui tests
"use strict";

const fs = require("fs");
const path = require("path");

const testPrefix = process.env.TEST_PREFIX || "ui";
// Configure settings.json ASAP when mocha starts to prevent a vscode prompt:
// "A settings has changed that requires a restart to take effect."
fs.mkdirSync("out/test-resources/settings/User/", { recursive: true });
fs.cpSync(
  "test/testFixtures/settings.json",
  "out/test-resources/settings/User/settings.json",
);

function getNextMochaFile() {
  let counter = 0;
  const baseDir = "./out/junit/ui";
  let filename = path.join(baseDir, `${testPrefix}-${counter}-test-results.xml`);

  // Ensure directory exists
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  while (fs.existsSync(filename)) {
    counter++;
    filename = path.join(baseDir, `${testPrefix}-${counter}-test-results.xml`);
  }
  return filename;
}

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
      mochaFile: getNextMochaFile(),
      outputs: true,
      suiteTitle: "ui",
      suiteTitleSeparatedBy: "::",
    },
  },
};
