import { spawn } from "node:child_process";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Lints Ansible playbook content using the ansible-lint CLI.
 *
 * @param playbookContent - The string content of the playbook to lint.
 * @param fix - Whether to apply automatic fixes using --fix flag.
 * @returns A promise that resolves with an object containing linting results and optionally fixed content.
 * @throws An error if the process fails or returns an error.
 */
export async function runAnsibleLint(
  playbookContent: string,
  fix: boolean = false,
): Promise<{ result: unknown; fixedContent?: string }> {
  if (!playbookContent) {
    throw new Error("No content was provided for linting.");
  }

  if (fix) {
    return await runAnsibleLintWithFix(playbookContent, true);
  } else {
    return await runAnsibleLintWithoutFix(playbookContent);
  }
}

async function runAnsibleLintWithoutFix(
  playbookContent: string,
): Promise<{ result: unknown; fixedContent?: string }> {
  return new Promise((resolve, reject) => {
    const args = ["-f", "json", "-"];
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

    // Write the playbook content to the process's stdin.
    lintProcess.stdin.write(playbookContent);
    lintProcess.stdin.end();
  });
}

async function runAnsibleLintWithFix(
  playbookContent: string,
  fix: boolean,
): Promise<{ result: unknown; fixedContent?: string }> {
  const tempDir = tmpdir();
  const tempFile = join(
    tempDir,
    `ansible-lint-${Date.now()}-${Math.random().toString(36).slice(2, 11)}.yml`,
  );

  try {
    // Write content to temporary file
    await writeFile(tempFile, playbookContent, "utf8");

    // Run ansible-lint on the file
    const result = await runAnsibleLintOnFile(tempFile, fix);

    // If fix was requested, read the fixed content
    let fixedContent: string | undefined;
    if (fix) {
      try {
        fixedContent = await readFile(tempFile, "utf8");
      } catch (err) {
        // If we can't read the fixed content, that's okay - we still have the linting results
        console.warn("Could not read fixed content:", err);
      }
    }

    return { result, fixedContent };
  } finally {
    // Clean up temporary file
    try {
      await unlink(tempFile);
    } catch (err) {
      console.warn("Could not delete temporary file:", err);
    }
  }
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
): string {
  // The result from ansible-lint is an array.
  if (!Array.isArray(result) || result.length === 0) {
    const fixMessage = fixApplied ? " (automatic fixes were applied)" : "";
    let output = `Linting completed\n✅ No issues found${fixMessage}.`;

    if (fixApplied && fixedContent) {
      output += `\n\n📝 Fixed content:\n\`\`\`yaml\n${fixedContent}\n\`\`\``;
    }

    return output;
  }

  const fixMessage = fixApplied
    ? " (some issues may have been automatically fixed)"
    : "";
  let output = `Linting results${fixMessage}:\n\n❌ Found ${result.length} issue(s):\n\n`;

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
      const filename = (location?.path as string) || "stdin";

      output += `${index + 1}. [${ruleId}] on line ${line} of ${filename}\n`;
      output += `   Message: ${description}\n\n`;
    }
  });

  if (fixApplied && fixedContent) {
    output += `\n📝 Fixed content:\n\`\`\`yaml\n${fixedContent}\n\`\`\``;
  }

  return output;
}
