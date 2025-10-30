import { spawn } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Lints Ansible playbook file using the ansible-lint CLI.
 *
 * @param filePath - The path to the Ansible playbook file to lint.
 * @param fix - Whether to apply automatic fixes using --fix flag.
 * @returns A promise that resolves with an object containing linting results and optionally fixed content.
 * @throws An error if the process fails or returns an error.
 */
export async function runAnsibleLint(
  filePath: string,
  fix: boolean = false,
): Promise<{ result: unknown; fixedContent?: string }> {
  if (!filePath) {
    throw new Error("No file path was provided for linting.");
  }

  // Resolve the file path to absolute path
  const absolutePath = resolve(filePath);

  // Check if file exists
  try {
    await access(absolutePath);
  } catch {
    throw new Error(`File not found: ${absolutePath}`);
  }

  if (fix) {
    return await runAnsibleLintWithFix(absolutePath, true);
  } else {
    return await runAnsibleLintWithoutFix(absolutePath);
  }
}

async function runAnsibleLintWithoutFix(
  filePath: string,
): Promise<{ result: unknown; fixedContent?: string }> {
  return new Promise((resolve, reject) => {
    const args = ["-f", "json", filePath];
    const lintProcess = spawn("ansible-lint", args);

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
    lintProcess.on("close", () => {
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
        resolve({ result });
      } catch {
        reject(
          new Error(
            `Failed to parse JSON output from ansible-lint. Raw output: ${stdoutData}`,
          ),
        );
      }
    });
  });
}

async function runAnsibleLintWithFix(
  filePath: string,
  fix: boolean,
): Promise<{ result: unknown; fixedContent?: string }> {
  // Run ansible-lint on the file directly
  const result = await runAnsibleLintOnFile(filePath, fix);

  // If fix was requested, read the fixed content from the original file
  let fixedContent: string | undefined;
  if (fix) {
    try {
      fixedContent = await readFile(filePath, "utf8");
    } catch (err) {
      console.warn("Could not read fixed content:", err);
    }
  }
  return { result, fixedContent };
}

async function runAnsibleLintOnFile(
  filePath: string,
  fix: boolean,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const args = ["-f", "json"];
    if (fix) {
      args.push("--fix");
    }
    args.push(filePath);

    const lintProcess = spawn("ansible-lint", args);

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

    // Handle errors during process spawning
    lintProcess.on("error", (err) => {
      reject(
        new Error(
          `Failed to start ansible-lint process. Is it installed and in your PATH? Details: ${err.message}`,
        ),
      );
    });

    // Handle process exit
    lintProcess.on("close", (code) => {
      // For --fix, exit code 0 means success, non-zero might still be okay if some fixes were applied
      // For regular linting, non-zero usually means issues were found (which is expected)
      if (stderrData && !stdoutData) {
        return reject(
          new Error(
            `ansible-lint failed with exit code ${code} and error:\n${stderrData}`,
          ),
        );
      }

      try {
        // Try to parse JSON output
        if (stdoutData.trim()) {
          const result = JSON.parse(stdoutData);
          resolve(result);
        } else {
          // If no JSON output, return empty array (no issues found)
          resolve([]);
        }
      } catch {
        // If JSON parsing fails, it might be because --fix was used and output format is different
        // Return empty array to indicate no issues found
        resolve([]);
      }
    });
  });
}

/**
 * Formats the JSON linting result into a user-friendly message
 */
export function formatLintingResult(
  result: unknown[],
  fixApplied: boolean = false,
  fixedContent?: string,
  filePath?: string,
): string {
  // The result from ansible-lint is an array.
  if (!Array.isArray(result) || result.length === 0) {
    const fixMessage = fixApplied ? " (automatic fixes were applied)" : "";
    const fileInfo = filePath ? ` for file: ${filePath}` : "";
    let output = `Linting completed${fileInfo}\n✅ No issues found${fixMessage}.`;

    if (fixApplied && fixedContent) {
      output += `\n\n📝 Fixed content:\n\`\`\`yaml\n${fixedContent}\n\`\`\``;
    }

    return output;
  }

  const fixMessage = fixApplied
    ? " (some issues may have been automatically fixed)"
    : "";
  const fileInfo = filePath ? ` for file: ${filePath}` : "";
  let output = `Linting results${fileInfo}${fixMessage}:\n\n❌ Found ${result.length} issue(s):\n\n`;

  result.forEach((issue, index) => {
    // Type guard to ensure issue is an object
    if (typeof issue === "object" && issue !== null) {
      const issueObj = issue as Record<string, unknown>;
      const ruleId = (issueObj.check_name as string) || "unknown-rule";
      const description =
        (issueObj.description as string) || "No description available.";
      const location = issueObj.location as Record<string, unknown>;
      const positions = location?.positions as Record<string, unknown>;
      const begin = positions?.begin as Record<string, unknown>;
      const line = (begin?.line as number) || "N/A";
      const filename = (location?.path as string) || filePath || "unknown file";

      output += `${index + 1}. [${ruleId}] on line ${line} of ${filename}\n`;
      output += `   Message: ${description}\n\n`;
    }
  });

  if (fixApplied && fixedContent) {
    output += `\n📝 Fixed content:\n\`\`\`yaml\n${fixedContent}\n\`\`\``;
    output += `\n\n**Next step**: These are the fixes ansible-lint was able to apply. You can now ask your agent to help optimize the playbook further if needed.`;
  }

  return output;
}
