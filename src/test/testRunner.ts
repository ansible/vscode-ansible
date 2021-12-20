import * as path from 'path';
import * as cp from 'child_process';
import {
  runTests,
  downloadAndUnzipVSCode,
  resolveCliPathFromVSCodeExecutablePath,
} from 'vscode-test';

async function main(): Promise<void> {
  try {
    const executable = await downloadAndUnzipVSCode();
    const cliPath = resolveCliPathFromVSCodeExecutablePath(executable);

    // Install the latest released redhat.ansible extension
    const installLog = cp.execSync(
      `"${cliPath}" --install-extension redhat.ansible --force`
    );
    console.log(installLog.toString());

    // Install the dependant extensions
    const dependencies = ['ms-python.python', 'redhat.vscode-yaml'];
    for (const dep of dependencies) {
      const installLog = cp.execSync(
        `"${cliPath}" --install-extension ${dep} --force`
      );
      console.log(installLog.toString());
    }

    // Grab installed extensions
    const extensionList = cp
      .execSync(`"${cliPath}" --list-extensions`)
      .toString()
      .trim()
      .split('\n');
    const requiredExtensionList = ['redhat.ansible', ...dependencies];

    const unwantedExtensionList = extensionList.filter(
      (item) => !requiredExtensionList.includes(item)
    );

    // Form command to disable all the extensions other than redhat.ansible and its dependencies
    const unwantedExtensionDisableCommands = unwantedExtensionList.map((item) =>
      '--disable-extension='.concat(item)
    );
    console.log(unwantedExtensionDisableCommands);

    // Set collections_path in env
    const FIXTURES_COLLECTION_DIR = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'src',
      'test',
      'testFixtures',
      'common',
      'collections'
    );
    process.env['ANSIBLE_COLLECTIONS_PATH'] = FIXTURES_COLLECTION_DIR;

    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './index');

    // Download VS Code, unzip it and run the integration test
    await runTests({
      vscodeExecutablePath: executable,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        ...unwantedExtensionDisableCommands,
        './src/test/testFixtures/',
      ],
    });
  } catch (err) {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
