import { CommandRunner } from "@src/utils/commandRunner.js";
import { describe, expect, it, vi } from "vitest";
import { AssertionError } from "assert";
import { WorkspaceManager } from "@src/services/workspaceManager.js";
import type { WorkspaceFolderContext } from "@src/services/workspaceManager.js";
import type { ExtensionSettings } from "@src/interfaces/extensionSettings.js";
import { createConnection } from "vscode-languageserver/node";
import { getDoc } from "@test/helper.js";
import { ExecException } from "child_process";
import { URI } from "vscode-uri";
import * as os from "node:os";
import * as path from "node:path";

describe("commandRunner", function () {
  const tests = [
    {
      args: ["ansible-config", "dump"],
      rc: 0,
      stdout: "ANSIBLE_FORCE_COLOR",
      stderr: "",
      pythonInterpreterPath: "",
      activationScript: "",
    },
    {
      args: ["ansible", "--version"],
      rc: 0,
      stdout: "configured module search path",
      stderr: "",
      pythonInterpreterPath: "",
      activationScript: "",
    },
    {
      args: ["ansible-lint", "--version"],
      rc: 0,
      stdout: "using ansible",
      stderr: "",
      pythonInterpreterPath: "",
      activationScript: "",
    },
    {
      args: ["ansible-playbook", "missing-file"],
      rc: 1,
      stdout: "",
      stderr: "the playbook: missing-file could not be found",
      pythonInterpreterPath: "",
      activationScript: "",
    },
    {
      args: [
        "python3",
        "-c",
        "\"import os; print(os.environ.get('VIRTUAL_ENV', 'unset'))\"",
      ],
      rc: 0,
      stdout: "unset",
      stderr: "",
      pythonInterpreterPath: "path-before-python/bin/python",
      activationScript: "",
    },
    {
      args: ["echo", "123"],
      rc: 0,
      stdout: "123",
      stderr: "",
      pythonInterpreterPath: "path-before-python/bin/python",
      activationScript: `${process.env.VIRTUAL_ENV}/bin/activate`,
    },
    {
      args: ["printenv", "ANSIBLE_CONFIG"],
      rc: 0,
      stdout: "/tmp/ansible.cfg",
      stderr: "",
      pythonInterpreterPath: "",
      activationScript: "",
      ansibleConfigPath: "/tmp/ansible.cfg",
    },
    {
      args: ["printenv", "ANSIBLE_CONFIG"],
      rc: 0,
      stdout: path.join(os.homedir(), "ansible.cfg"),
      stderr: "",
      pythonInterpreterPath: "",
      activationScript: "",
      ansibleConfigPath: "~/ansible.cfg",
    },
    {
      args: ["printenv", "ANSIBLE_CONFIG"],
      rc: 0,
      stdout: os.homedir(),
      stderr: "",
      pythonInterpreterPath: "",
      activationScript: "",
      ansibleConfigPath: "~",
    },
  ];

  tests.forEach(
    ({
      args,
      rc,
      stdout,
      stderr,
      pythonInterpreterPath,
      activationScript,
      ansibleConfigPath,
    }) => {
      it(`call ${args.join(" ")}`, { timeout: 10000 }, async () => {
        process.argv.push("--node-ipc");
        const connection = createConnection();
        const workspaceManager = new WorkspaceManager(connection);
        const textDoc = getDoc("yaml/ancestryBuilder.yml");
        const context = workspaceManager.getContext(textDoc.uri);
        if (context) {
          const settings = await context.documentSettings.get(textDoc.uri);
          if (pythonInterpreterPath) {
            settings.python.interpreterPath = pythonInterpreterPath;
          }
          if (activationScript) {
            settings.python.activationScript = activationScript;
          }
          if (ansibleConfigPath) {
            settings.config.path = ansibleConfigPath;
          }

          const commandRunner = new CommandRunner(
            connection,
            context,
            settings,
          );
          try {
            const proc = await commandRunner.runCommand(
              args[0],
              args.slice(1).join(" "),
            );
            expect(proc.stdout).toContain(stdout);
            expect(proc.stderr).toContain(stderr);
          } catch (e) {
            if (e instanceof AssertionError) {
              throw e;
            }
            if (e instanceof Error) {
              const err = e as ExecException;
              expect(err.code).toBe(rc);
              expect(err.stdout).toContain(stdout);
              expect(err.stderr).toContain(stderr);
            }
          }
        }
      });
    },
  );

  it.each([
    {
      configuredPath: "ansible/ansible.cfg",
      expectedRelativePath: "ansible/ansible.cfg",
    },
    {
      configuredPath:
        "${workspaceFolder}/ansible/${workspaceFolder}/ansible.cfg",
      expectedPath: `${process.cwd()}/ansible/${process.cwd()}/ansible.cfg`,
    },
    { configuredPath: "" },
  ])(
    "passes $configuredPath to the execution environment",
    async ({
      configuredPath,
      expectedRelativePath,
      expectedPath: pathValue,
    }) => {
      const workspaceFolder = process.cwd();
      const expectedPath =
        pathValue ??
        (expectedRelativePath
          ? path.join(workspaceFolder, expectedRelativePath)
          : undefined);
      const wrapContainerArgs = vi.fn().mockReturnValue(["printf", "ok"]);
      const context = {
        workspaceFolder: { uri: URI.file(workspaceFolder).toString() },
        executionEnvironment: Promise.resolve({ wrapContainerArgs }),
      } as unknown as WorkspaceFolderContext;
      const settings = {
        config: { path: configuredPath },
        executionEnvironment: { enabled: true },
        python: { interpreterPath: "", activationScript: "" },
      } as ExtensionSettings;
      const commandRunner = new CommandRunner(undefined, context, settings);

      const result = await commandRunner.runCommand("ansible", "--version");

      expect(result.stdout).toBe("ok");
      expect(wrapContainerArgs).toHaveBeenCalledOnce();
      const [, mountPaths, envOverrides] = wrapContainerArgs.mock.calls[0];
      expect(envOverrides).toEqual(
        expectedPath ? { ANSIBLE_CONFIG: expectedPath } : {},
      );
      expect(mountPaths).toEqual(
        new Set(
          expectedPath
            ? [workspaceFolder, path.dirname(expectedPath)]
            : [workspaceFolder],
        ),
      );
    },
  );

  it("returns an empty result when the execution environment is unavailable", async () => {
    const wrapContainerArgs = vi.fn().mockReturnValue(undefined);
    const workspaceFolder = process.cwd();
    const context = {
      workspaceFolder: { uri: URI.file(workspaceFolder).toString() },
      executionEnvironment: Promise.resolve({ wrapContainerArgs }),
    } as unknown as WorkspaceFolderContext;
    const settings = {
      config: { path: "/tmp/ansible.cfg" },
      executionEnvironment: { enabled: true },
      python: { interpreterPath: "", activationScript: "" },
    } as ExtensionSettings;
    const commandRunner = new CommandRunner(undefined, context, settings);
    const mountPaths = new Set(["/tmp/custom-mount"]);

    const result = await commandRunner.runCommand(
      "ansible",
      "--version",
      workspaceFolder,
      mountPaths,
    );

    expect(result).toEqual({ stdout: "", stderr: "" });
    expect(wrapContainerArgs).toHaveBeenCalledWith(
      "ansible --version",
      new Set(["/tmp/custom-mount", "/tmp"]),
      { ANSIBLE_CONFIG: "/tmp/ansible.cfg" },
    );
  });
});
