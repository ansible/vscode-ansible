import * as path from "path";
import Mocha from "mocha";
import glob from "glob";

export async function run(): Promise<void> {
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

  return new Promise((c, e) => {
    try {
      // Run the mocha test
      mocha.run((failures: number) => {
        if (failures > 0) {
          e(new Error(`${failures} tests failed.`));
        } else {
          c();
        }
      });
    } catch (err) {
      console.error(err);
      e(err);
    }
  });
}
