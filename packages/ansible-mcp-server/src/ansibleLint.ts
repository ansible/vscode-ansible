import { spawn } from "node:child_process";

/**
 * Lints Ansible playbook content using the ansible-lint CLI via stdin.
 *
 * @param playbookContent The string content of the playbook to lint.
 * @returns A promise that resolves with the parsed JSON output from ansible-lint.
 * @throws An error if the process fails or returns an error.
 */
export async function runAnsibleLint(playbookContent: string): Promise<any> {
    return new Promise((resolve, reject) => {
        if (!playbookContent) {
            return reject(new Error("No content was provided for linting."));
        }

        const lintProcess = spawn("ansible-lint", ["-f", "json", "-"]);

        let stdoutData = "";
        let stderrData = "";

        // Capture standard output
        lintProcess.stdout.on("data", (data) => {
            stdoutData += data.toString();
        });

        // Capture standard error
        lintProcess.stderr.on("data", (data) => {
            stderrData += data.toString();
        });

        // Handle errors during process spawning (e.g., 'ansible-lint' not found)
        lintProcess.on("error", (err) => {
            reject(
                new Error(
                    `Failed to start ansible-lint process. Is it installed and in your PATH? Details: ${err.message}`,
                ),
            );
        });

        // Handle process exit
        lintProcess.on("close", (code) => {
            // ansible-lint can exit with a non-zero code if linting issues are found.
            // This is expected. A real error is when stderr has content and stdout is empty.
            if (stderrData && !stdoutData) {
                return reject(
                    new Error(`ansible-lint failed with error:\n${stderrData}`),
                );
            }

            try {
                // Even with linting errors, valid JSON is printed to stdout.
                const result = JSON.parse(stdoutData);
                resolve(result);
            } catch (parseError) {
                reject(
                    new Error(
                        `Failed to parse JSON output from ansible-lint. Raw output: ${stdoutData}`,
                    ),
                );
            }
        });

        // **This is the key part:** Write the playbook content to the process's stdin.
        lintProcess.stdin.write(playbookContent);

        // **Crucially, close the stdin stream.** This signals to ansible-lint
        // that you are done sending content, so it can start processing.
        lintProcess.stdin.end();
    });
}

/**
 * Formats the JSON linting result into a user-friendly message
 */
export function formatLintingResult(result: any[]): string {
  // The result from ansible-lint is an array.
  if (!Array.isArray(result) || result.length === 0) {
    return `Linting completed\n✅ No issues found.`;
  }

  let output = `Linting results:\n\n❌ Found ${result.length} issue(s):\n\n`;

  result.forEach((issue, index) => {
    const ruleId = issue.check_name || "unknown-rule";
    const description = issue.description || "No description available.";
    const line = issue.location?.positions?.begin?.line || "N/A";
    const filename = issue.location?.path || "stdin";

    output += `${index + 1}. [${ruleId}] on line ${line} of ${filename}\n`;
    output += `   Message: ${description}\n\n`;
  });

  return output;
}
