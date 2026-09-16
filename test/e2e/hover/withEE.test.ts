import * as vscode from "vscode";
import {
  getDocUri,
  activate,
  testHover,
  setFixtureAnsibleCollectionPathEnv,
  skip_ee,
  deleteAlsCache,
  enableExecutionEnvironmentSettings,
  disableExecutionEnvironmentSettings,
  unSetFixtureAnsibleCollectionPathEnv,
} from "@test/e2e/e2e.utils";

describe("ee", function () {
  before(async function () {
    if (skip_ee) {
      this.skip();
    }
    deleteAlsCache();
    setFixtureAnsibleCollectionPathEnv(
      "/home/runner/.ansible/collections:/usr/share/ansible/collections",
    );
    await enableExecutionEnvironmentSettings();
  });

  after(async function () {
    await disableExecutionEnvironmentSettings(); // Revert back the default settings
    unSetFixtureAnsibleCollectionPathEnv();
    deleteAlsCache();
  });

  describe("hover-ee", function () {
    const docUri1 = getDocUri("hover/with_ee/1.yml");

    before(async function () {
      this.timeout(60_000);
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await activate(docUri1);
      setFixtureAnsibleCollectionPathEnv(
        "/home/runner/.ansible/collections:/usr/share/ansible/collections",
      );
    });

    it("should receive docsLibraryReady from ALS", async function () {
      this.timeout(60_000);
      await vscode.commands.executeCommand("ansible.awaitDocsLibraryReady");
    });

    describe("Hover for play keywords", function () {
      it("should hover over `name` keyword", async function () {
        await testHover(docUri1, new vscode.Position(0, 4), [
          {
            contents: [
              "Identifier. Can be used for documentation, or in tasks/handlers.",
            ],
          },
        ]);
      });

      it("should hover over `hosts` keyword", async function () {
        await testHover(docUri1, new vscode.Position(2, 4), [
          {
            contents: [
              "A list of groups, hosts or host pattern that translates into a list of hosts that are the play’s target.",
            ],
          },
        ]);
      });

      it("should hover over `tasks` keyword", async function () {
        await testHover(docUri1, new vscode.Position(3, 4), [
          {
            contents: [
              "Main list of tasks to execute in the play, they run after roles and before post_tasks.",
            ],
          },
        ]);
      });
    });

    describe("Hover for builtin module name and options", function () {
      // Builtin module docs in EE mode may take longer to be indexed.
      // Use more aggressive retry options to handle timing variability.
      const builtinRetryOptions = { retries: 10, retryDelay: 1000 };

      it("should hover over builtin module name", async function () {
        this.timeout(30_000);
        await testHover(
          docUri1,
          new vscode.Position(5, 7),
          [
            {
              contents: ["Print statements during execution"],
            },
          ],
          builtinRetryOptions,
        );
      });

      it("should hover over builtin module option", async function () {
        this.timeout(30_000);
        await testHover(
          docUri1,
          new vscode.Position(6, 9),
          [
            {
              contents: ["customized message"],
            },
          ],
          builtinRetryOptions,
        );
      });
    });

    describe("Hover for module name and options present in the EE", function () {
      // Collection module docs may also benefit from retry logic for stability
      const collectionRetryOptions = { retries: 5, retryDelay: 500 };

      it("should hover over collection module name present in EE (ansible.posix.patch)", async function () {
        await testHover(
          docUri1,
          new vscode.Position(9, 7),
          [
            {
              contents: ["GNU patch"],
            },
          ],
          collectionRetryOptions,
        );
      });

      it("should hover over collection module option present in EE (ansible.posix.patch -> src)", async function () {
        await testHover(
          docUri1,
          new vscode.Position(10, 9),
          [
            {
              contents: ["GNU patch"],
            },
          ],
          collectionRetryOptions,
        );
      });

      it("should hover over collection module option present in EE (ansible.posix.patch -> dest)", async function () {
        await testHover(
          docUri1,
          new vscode.Position(11, 9),
          [
            {
              contents: ["remote machine"],
            },
          ],
          collectionRetryOptions,
        );
      });
    });

    describe("Hover for module name and options absent in the EE", function () {
      it("should not hover over collection module name present in EE (vyos.vyos.vyos_prefix_list)", async function () {
        await testHover(docUri1, new vscode.Position(14, 8), []);
      });

      it("should not hover over collection module option present in EE (vyos.vyos.vyos_prefix_list -> config)", async function () {
        await testHover(docUri1, new vscode.Position(15, 10), []);
      });
    });
  });
});
