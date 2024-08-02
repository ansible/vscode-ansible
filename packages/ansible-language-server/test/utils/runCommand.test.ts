import { CommandRunner } from "../../src/utils/commandRunner";
import { AssertionError, expect } from "chai";
import { WorkspaceManager } from "../../src/services/workspaceManager";
import { createConnection } from "vscode-languageserver/node";
import { getDoc } from "../helper";
import * as path from "path";
import { readFileSync } from "fs";
import { ExecException } from "child_process";

describe("commandRunner", () => {
  const packageJsonPath = require.resolve("../../package.json");
  const packageJsonContents = readFileSync(packageJsonPath).toString();
  const pkgJSON = JSON.parse(packageJsonContents);

  const tests = [
    {
      args: [
        path.join(
          path.resolve(__dirname, "..", ".."),
          "bin",
          "ansible-language-server",
        ),
        "--version",
      ],
      rc: 0,
      stdout: `${pkgJSON["version"]}`,
      stderr: "",
      pythonInterpreterPath: "",
    },
    {
      args: ["ansible-config", "dump"],
      rc: 0,
      stdout: "ANSIBLE_FORCE_COLOR",
      stderr: "",
      pythonInterpreterPath: "",
    },
    {
      args: ["ansible", "--version"],
      rc: 0,
      stdout: "configured module search path",
      stderr: "",
      pythonInterpreterPath: "",
    },
    {
      args: ["ansible-lint", "--version"],
      rc: 0,
      stdout: "using ansible",
      stderr: "",
      pythonInterpreterPath: "",
    },
    {
      args: ["ansible-playbook", "missing-file"],
      rc: 1,
      stdout: "",
      stderr: "ERROR! the playbook: missing-file could not be found",
      pythonInterpreterPath: "",
    },
    {
      args: [
        "python3",
        "-c",
        "\"import os; print(os.environ.get('VIRTUAL_ENV'))\"",
      ],
      rc: 0,
      stdout: "path-before-python",
      stderr: "",
      pythonInterpreterPath: "path-before-python/bin/python",
    },
  ];

  tests.forEach(({ args, rc, stdout, stderr, pythonInterpreterPath }) => {
    it(`call ${args.join(" ")}`, async function () {
      this.timeout(10000);

      // try to enforce ansible to output ANSI in order to check if we are
      // still able to disable it at runtime in order to keep output parseable.
      process.env.ANSIBLE_FORCE_COLOR = "1";

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

        const commandRunner = new CommandRunner(connection, context, settings);
        try {
          const proc = await commandRunner.runCommand(
            args[0],
            args.slice(1).join(" "),
          );
          expect(proc.stdout, proc.stderr).contains(stdout);
          expect(proc.stderr, proc.stdout).contains(stderr);
        } catch (e) {
          if (e instanceof AssertionError) {
            throw e;
          }
          if (e instanceof Error) {
            const err = e as ExecException;
            expect(err.code).equals(rc);
            expect(err.stdout).contains(stdout);
            expect(err.stderr).contains(stderr);
          }
        }
      }
    });
  });
});
