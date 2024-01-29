import * as path from "path";
import Mocha from "mocha";
import { glob } from "glob";

function setupCoverage() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const NYC = require("nyc");
  const nyc = new NYC({
    cwd: path.join(__dirname, "..", "..", ".."),
    reporter: ["text", "html", "lcov"],
    all: true,
    silent: false,
    instrument: true,
    hookRequire: true,
    hookRunInContext: true,
    hookRunInThisContext: true,
    include: ["out/client/src/**/*.js"],
    reportDir: "out/coverage",
    tempDir: "out/.nyc_output",
  });

  nyc.reset();
  nyc.wrap();

  return nyc;
}

export async function run(): Promise<void> {
  // Setup NYC for code coverage
  const nyc = process.env.COVERAGE ? setupCoverage() : null;

  // if (nyc) { // For debugging
  //   console.log("Glob verification", await nyc.exclude.glob(nyc.cwd));
  // }

  // Create the mocha test
  const mocha = new Mocha({
    color: true,
    ui: "bdd",
    timeout: 50000,
    reporter: "mochawesome",
    reporterOptions: {
      reportFilename: "e2e_test_report",
      reportDir: "out/e2eTestReport",
      reportTitle: "vscode-ansible e2e test",
      reportPageTitle: "vscode-ansible e2e test report",
      cdn: true,
      charts: true,
    },
  });

  const testsRoot = path.resolve(__dirname, "..");

  const files = await glob("**/**.test.js", { cwd: testsRoot });

  // Add files to the test suite
  files.forEach((file) => mocha.addFile(path.resolve(testsRoot, file)));

  try {
    await new Promise<void>((c, e) => {
      // Run the mocha test
      mocha.run((failures: number) => {
        if (failures > 0) {
          e(new Error(`${failures} tests failed.`));
        } else {
          c();
        }
      });
    });
  } catch (err) {
    console.error(err);
    throw err;
  } finally {
    if (nyc) {
      nyc.writeCoverageFile();
      await nyc.report();
    }
  }
}
