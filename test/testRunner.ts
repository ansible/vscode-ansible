import * as path from "path";
import * as cp from "child_process";
import {
  runTests,
  downloadAndUnzipVSCode,
  resolveCliPathFromVSCodeExecutablePath,
} from "vscode-test";
import fs from "fs";

async function main(): Promise<void> {
  try {
    const executable = await downloadAndUnzipVSCode();
    const cliPath = resolveCliPathFromVSCodeExecutablePath(executable);
    const userDataPath = path.resolve(__dirname, "../../userdata");
    const extPath = path.resolve(__dirname, "../../ext");
    // We want to avoid using developer data dir as this is likely to break
    // testing and make its outcome very hard to reproduce across machines.
    // https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations
    const cliArgs = [
      `--user-data-dir=${userDataPath}`,
      `--extensions-dir=${extPath}`,
    ];

    // Copy default user settings.json
    const settings_src = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "test",
      "testFixtures",
      "settings.json"
    );
    const settings_dst = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "out",
      "userdata",
      "User",
      "settings.json"
    );
    fs.mkdirSync(path.dirname(settings_dst), { recursive: true });
    fs.copyFileSync(settings_src, settings_dst);

    // Install the latest released redhat.ansible extension
    const installLog = cp.execSync(
      `"${cliPath}" ${cliArgs.join(
        " "
      )} --install-extension redhat.ansible --force`
    );
    console.log(installLog.toString());

    // Install the dependent extensions
    const dependencies = ["ms-python.python", "redhat.vscode-yaml"];
    for (const dep of dependencies) {
      const installLog = cp.execSync(
        `"${cliPath}" ${cliArgs.join(" ")} --install-extension ${dep} --force`
      );
      console.log(installLog.toString());
    }

    // Display active extensions
    const cmd = `"${cliPath}" ${cliArgs.join(
      " "
    )} --list-extensions --show-versions`;
    const extLog = cp.execSync(cmd);
    console.warn("%s\n%s", cmd, extLog.toString());

    // Set collections_path in env
    const FIXTURES_COLLECTION_DIR = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "test",
      "testFixtures",
      "common",
      "collections"
    );
    process.env["ANSIBLE_COLLECTIONS_PATH"] = FIXTURES_COLLECTION_DIR;

    // This is necessary to prevent failures.
    // For more details regarding the cause, check https://github.com/ansible/vscode-ansible/issues/373
    process.env["ANSIBLE_FORCE_COLOR"] = "0";

    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./index");

    // Download VS Code, unzip it and run the integration test
    await runTests({
      vscodeExecutablePath: executable,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: cliArgs.concat([
        "--disable-extension=ritwickdey.liveserver",
        "--disable-extension=redhat.fabric8-analytics",
        "--disable-extension=lextudio.restructuredtext",
        "--disable-extension=ms-vsliveshare.vsliveshare",
        "--disable-extension=GitHub.vscode-pull-request-github",
        "--disable-extension=eamodio.gitlens",
        "--disable-extension=streetsidesoftware.code-spell-checker",
        "--disable-extension=alefragnani.project-manager",
        "--disable-extension=GitHub.copilot",
        "./test/testFixtures/",
      ]),
    });
  } catch (err) {
    console.error("Failed to run tests due to exception!\n%s", err);
    process.exit(1);
  }
}

main();
