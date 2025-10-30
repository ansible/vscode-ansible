import { spawnSync } from "node:child_process";

/**
 * Runs ansible-creator with the specified command and arguments.
 *
 * @param command - The ansible-creator command to run (e.g., 'init', 'list').
 * @param args - Additional arguments for the command.
 * @returns A promise that resolves with the output from ansible-creator.
 * @throws An error if the process fails or returns an error.
 */
export async function runCreator(
  args: string[] = [],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const creatorProcess = spawnSync("ansible-creator", args);

    const stdoutData = creatorProcess.stdout.toString();
    const stderrData = creatorProcess.stderr.toString();

    if (creatorProcess.status !== 0 && stderrData) {
      return reject(
        new Error(
          `ansible-creator exited with code ${creatorProcess.status}:\n${stderrData}`,
        ),
      );
    }

    resolve({
      stdout: stdoutData,
      stderr: stderrData,
    });
  });
}

/**
 * Formats the ansible-creator result into a user-friendly message
 */
export function formatCreatorResult(
  command: string,
  result: { stdout: string; stderr: string },
): string {
  let output = `✅ ansible-creator ${command} completed successfully\n\n`;

  /* v8 ignore if -- @preserve */
  if (result.stdout) {
    output += `Output:\n${result.stdout}\n`;
  }

  /* v8 ignore if -- @preserve */
  if (result.stderr) {
    output += `\nAdditional information:\n${result.stderr}\n`;
  }

  return output;
}

/**
 * Creates a generic handler for ansible-creator init commands
 */
export function createInitHandler(projectType: "playbook" | "collection") {
  return async (args: { name: string; path?: string }) => {
    try {
      const creatorArgs = ["init", projectType, "--no-overwrite", args.name];
      /* v8 ignore if -- @preserve */
      if (args.path) {
        creatorArgs.push("--path", args.path);
      }

      const result = await runCreator(creatorArgs);
      const formattedResult = formatCreatorResult(
        `init ${projectType}`,
        result,
      );

      return {
        content: [{ type: "text" as const, text: formattedResult }],
      };
    } catch (error) {
      /* v8 ignore next -- @preserve */
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error creating ${projectType}: ${errorMessage}\n`,
          },
        ],
        isError: true,
      };
    }
  };
}
