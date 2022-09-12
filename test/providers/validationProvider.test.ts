import { TextDocument } from "vscode-languageserver-textdocument";
import { expect } from "chai";
import { Position, integer } from "vscode-languageserver";
import {
  doValidate,
  getYamlValidation,
} from "../../src/providers/validationProvider";
import { WorkspaceFolderContext } from "../../src/services/workspaceManager";
import {
  createTestValidationManager,
  createTestWorkspaceManager,
  getDoc,
  resolveDocUri,
  enableExecutionEnvironmentSettings,
  disableExecutionEnvironmentSettings,
  setFixtureAnsibleCollectionPathEnv,
} from "../helper";
import { ValidationManager } from "../../src/services/validationManager";

function testValidationFromCache(
  validationManager: ValidationManager,
  textDoc: TextDocument,
) {
  it("should provide no diagnostics", async function () {
    const actualDiagnostics = await doValidate(textDoc, validationManager);

    expect(actualDiagnostics.size).to.equal(0);
  });
}

function assertValidateTests(
  tests,
  context: WorkspaceFolderContext,
  validationManager: ValidationManager,
  textDoc: TextDocument,
) {
  tests.forEach((test) => {
    it(`should provide diagnostics for ${test.name}`, async function () {
      const actualDiagnostics = await doValidate(
        textDoc,
        validationManager,
        false,
        context,
      );

      if (test.diagnosticReport.length === 0) {
        expect(actualDiagnostics.has(`file://${textDoc.uri}`)).to.be.false;
      } else {
        expect(actualDiagnostics.get(`file://${textDoc.uri}`).length).to.equal(
          test.diagnosticReport.length,
        );

        actualDiagnostics.get(`file://${textDoc.uri}`).forEach((diag, i) => {
          const actDiag = diag;
          const expDiag = test.diagnosticReport[i];

          expect(actDiag.message).include(expDiag.message);
          expect(actDiag.range).to.deep.equal(expDiag.range);
          expect(actDiag.severity).to.equal(expDiag.severity);
          expect(actDiag.source).to.equal(expDiag.source);
        });
      }
    });
  });
}

function testAnsibleLintErrors(
  context: WorkspaceFolderContext,
  validationManager: ValidationManager,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "specific ansible lint errors",
      diagnosticReport: [
        {
          severity: 1,
          message: "violates variable naming standards",
          range: {
            start: { line: 4, character: 0 } as Position,
            end: {
              line: 4,
              character: integer.MAX_VALUE,
            } as Position,
          },
          source: "Ansible",
        },
        {
          severity: 1,
          message: "All tasks should be named",
          range: {
            start: { line: 6, character: 0 } as Position,
            end: {
              line: 6,
              character: integer.MAX_VALUE,
            } as Position,
          },
          source: "Ansible",
        },
        {
          severity: 1,
          message: "Use FQCN for builtin actions",
          range: {
            start: { line: 14, character: 0 } as Position,
            end: {
              line: 14,
              character: integer.MAX_VALUE,
            } as Position,
          },
          source: "Ansible",
        },
        {
          severity: 1,
          message: "Commands should not change things if nothing needs doing",
          range: {
            start: { line: 14, character: 0 } as Position,
            end: {
              line: 14,
              character: integer.MAX_VALUE,
            } as Position,
          },
          source: "Ansible",
        },
      ],
    },
  ];
  assertValidateTests(tests, context, validationManager, textDoc);
}

function testAnsibleSyntaxCheckNoErrors(
  context: WorkspaceFolderContext,
  validationManager: ValidationManager,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "no specific ansible lint errors",
      diagnosticReport: [],
    },
  ];
  assertValidateTests(tests, context, validationManager, textDoc);
}

function testAnsibleSyntaxCheckEmptyPlaybook(
  context: WorkspaceFolderContext,
  validationManager: ValidationManager,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "empty playbook",
      diagnosticReport: [],
    },
  ];
  assertValidateTests(tests, context, validationManager, textDoc);
}

function testAnsibleSyntaxCheckNoHost(
  context: WorkspaceFolderContext,
  validationManager: ValidationManager,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "no host",
      diagnosticReport: [
        {
          severity: 1,
          // eslint-disable-next-line quotes
          message: "the field 'hosts' is required but was not set",
          range: {
            start: { line: 0, character: 0 } as Position,
            end: {
              line: 0,
              character: integer.MAX_VALUE,
            } as Position,
          },
          source: "Ansible",
        },
      ],
    },
  ];
  assertValidateTests(tests, context, validationManager, textDoc);
}

function testInvalidYamlFile(
  context: WorkspaceFolderContext,
  validationManager: ValidationManager,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "invalid YAML",
      file: "diagnostics/invalid_yaml.yml",
      diagnosticReport: [
        {
          severity: 1,
          message: "Nested mappings are not allowed",
          range: {
            start: { line: 6, character: 13 } as Position,
            end: {
              line: 6,
              character: 13,
            } as Position,
          },
          source: "Ansible [YAML]",
        },
        {
          severity: 1,
          message: "Document contains trailing content",
          range: {
            start: { line: 7, character: 0 } as Position,
            end: {
              line: 8,
              character: 0,
            } as Position,
          },
          source: "Ansible [YAML]",
        },
      ],
    },
  ];

  tests.forEach(({ name, diagnosticReport }) => {
    it(`should provide diagnostic for ${name}`, async function () {
      const actualDiagnostics = getYamlValidation(textDoc);
      expect(actualDiagnostics.length).to.equal(diagnosticReport.length);

      actualDiagnostics.forEach((diag, i) => {
        const actDiag = diag;
        const expDiag = diagnosticReport[i];

        expect(actDiag.message).include(expDiag.message);
        expect(actDiag.range).to.deep.equal(expDiag.range);
        expect(actDiag.severity).to.equal(expDiag.severity);
        expect(actDiag.source).to.equal(expDiag.source);
      });
    });
  });
}

describe("doValidate()", () => {
  const workspaceManager = createTestWorkspaceManager();
  const validationManager = createTestValidationManager();
  let fixtureFilePath = "diagnostics/lint_errors.yml";
  let fixtureFileUri = resolveDocUri(fixtureFilePath);
  let context = workspaceManager.getContext(fixtureFileUri);

  let textDoc = getDoc(fixtureFilePath);
  let docSettings = context.documentSettings.get(textDoc.uri);

  describe("Get validation only from cache", () => {
    describe("With EE enabled @ee", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible",
        );
        await enableExecutionEnvironmentSettings(docSettings);
      });

      testValidationFromCache(validationManager, textDoc);

      after(async () => {
        setFixtureAnsibleCollectionPathEnv();
        await disableExecutionEnvironmentSettings(docSettings);
      });
    });

    describe("With EE disabled", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv();
        await disableExecutionEnvironmentSettings(docSettings);
      });

      testValidationFromCache(validationManager, textDoc);
    });
  });

  describe("Ansible diagnostics", () => {
    describe("Diagnostics using ansible-lint", () => {
      describe("With EE enabled @ee", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible",
          );
          await enableExecutionEnvironmentSettings(docSettings);
        });

        testAnsibleLintErrors(context, validationManager, textDoc);

        after(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("With EE disabled", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });

        testAnsibleLintErrors(context, validationManager, textDoc);
      });
    });

    describe("Diagnostics after falling back to --syntax-check due to change in settings", () => {
      describe("no specific ansible lint errors", () => {
        describe("With EE enabled @ee", () => {
          before(async () => {
            (await docSettings).ansibleLint.enabled = false;
            setFixtureAnsibleCollectionPathEnv(
              "/home/runner/.ansible/collections:/usr/share/ansible",
            );
            await enableExecutionEnvironmentSettings(docSettings);
          });

          testAnsibleSyntaxCheckNoErrors(context, validationManager, textDoc);

          after(async () => {
            (await docSettings).ansibleLint.enabled = true;
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });
        });

        describe("With EE disabled", () => {
          before(async () => {
            (await docSettings).ansibleLint.enabled = false;
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });

          testAnsibleSyntaxCheckNoErrors(context, validationManager, textDoc);
        });
        after(async () => {
          (await docSettings).ansibleLint.enabled = true;
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("empty playbook", () => {
        fixtureFilePath = "diagnostics/empty.yml";
        fixtureFileUri = resolveDocUri(fixtureFilePath);
        context = workspaceManager.getContext(fixtureFileUri);

        textDoc = getDoc(fixtureFilePath);
        docSettings = context.documentSettings.get(textDoc.uri);

        describe("With EE enabled @ee", () => {
          before(async () => {
            (await docSettings).ansibleLint.enabled = false;
            setFixtureAnsibleCollectionPathEnv(
              "/home/runner/.ansible/collections:/usr/share/ansible",
            );
            await enableExecutionEnvironmentSettings(docSettings);
          });

          testAnsibleSyntaxCheckEmptyPlaybook(
            context,
            validationManager,
            textDoc,
          );

          after(async () => {
            (await docSettings).ansibleLint.enabled = true;
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });
        });

        describe("With EE disabled", () => {
          before(async () => {
            (await docSettings).ansibleLint.enabled = false;
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });

          testAnsibleSyntaxCheckEmptyPlaybook(
            context,
            validationManager,
            textDoc,
          );
        });
        after(async () => {
          (await docSettings).ansibleLint.enabled = true;
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("no host", () => {
        fixtureFilePath = "diagnostics/noHost.yml";
        fixtureFileUri = resolveDocUri(fixtureFilePath);
        context = workspaceManager.getContext(fixtureFileUri);

        textDoc = getDoc(fixtureFilePath);
        docSettings = context.documentSettings.get(textDoc.uri);

        describe("With EE enabled @ee", () => {
          before(async () => {
            (await docSettings).ansibleLint.enabled = false;
            setFixtureAnsibleCollectionPathEnv(
              "/home/runner/.ansible/collections:/usr/share/ansible",
            );
            await enableExecutionEnvironmentSettings(docSettings);
          });

          testAnsibleSyntaxCheckNoHost(context, validationManager, textDoc);

          after(async () => {
            (await docSettings).ansibleLint.enabled = true;
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });
        });

        describe("With EE disabled", () => {
          before(async () => {
            (await docSettings).ansibleLint.enabled = false;
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });

          testAnsibleSyntaxCheckNoHost(context, validationManager, textDoc);
        });
        after(async () => {
          (await docSettings).ansibleLint.enabled = true;
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });
    });

    describe("Diagnostics after falling back to --syntax-check due to unavailability of ansible-lint", () => {
      describe("no specific ansible lint errors", () => {
        fixtureFilePath = "diagnostics/lint_errors.yml";
        fixtureFileUri = resolveDocUri(fixtureFilePath);
        context = workspaceManager.getContext(fixtureFileUri);

        textDoc = getDoc(fixtureFilePath);
        docSettings = context.documentSettings.get(textDoc.uri);

        describe("With EE enabled @ee", () => {
          before(async () => {
            (await docSettings).ansibleLint.enabled = false;
            (await docSettings).ansibleLint.path = "invalid-ansible-lint-path";
            setFixtureAnsibleCollectionPathEnv(
              "/home/runner/.ansible/collections:/usr/share/ansible",
            );
            await enableExecutionEnvironmentSettings(docSettings);
          });

          testAnsibleSyntaxCheckNoErrors(context, validationManager, textDoc);

          after(async () => {
            (await docSettings).ansibleLint.enabled = true;
            (await docSettings).ansibleLint.path = "ansible-lint";
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });
        });

        describe("With EE disabled", () => {
          before(async () => {
            (await docSettings).ansibleLint.enabled = false;
            (await docSettings).ansibleLint.path = "invalid-ansible-lint-path";
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });

          testAnsibleSyntaxCheckNoErrors(context, validationManager, textDoc);
        });
        after(async () => {
          (await docSettings).ansibleLint.enabled = true;
          (await docSettings).ansibleLint.path = "ansible-lint";
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("no host", () => {
        fixtureFilePath = "diagnostics/noHost.yml";
        fixtureFileUri = resolveDocUri(fixtureFilePath);
        context = workspaceManager.getContext(fixtureFileUri);

        textDoc = getDoc(fixtureFilePath);
        docSettings = context.documentSettings.get(textDoc.uri);

        describe("With EE enabled @ee", () => {
          before(async () => {
            (await docSettings).ansibleLint.enabled = false;
            (await docSettings).ansibleLint.path = "invalid-ansible-lint-path";
            setFixtureAnsibleCollectionPathEnv(
              "/home/runner/.ansible/collections:/usr/share/ansible",
            );
            await enableExecutionEnvironmentSettings(docSettings);
          });

          testAnsibleSyntaxCheckNoHost(context, validationManager, textDoc);

          after(async () => {
            (await docSettings).ansibleLint.enabled = true;
            (await docSettings).ansibleLint.path = "ansible-lint";
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });
        });

        describe("With EE disabled", () => {
          before(async () => {
            (await docSettings).ansibleLint.enabled = false;
            (await docSettings).ansibleLint.path = "invalid-ansible-lint-path";
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });

          testAnsibleSyntaxCheckNoHost(context, validationManager, textDoc);
        });
        after(async () => {
          (await docSettings).ansibleLint.enabled = true;
          (await docSettings).ansibleLint.path = "ansible-lint";
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });
    });

    describe("Diagnostics after falling back to --syntax-check due to failure in execution of ansible-lint command", () => {
      describe("no specific ansible lint errors", () => {
        fixtureFilePath = "diagnostics/lint_errors.yml";
        fixtureFileUri = resolveDocUri(fixtureFilePath);
        context = workspaceManager.getContext(fixtureFileUri);

        textDoc = getDoc(fixtureFilePath);
        docSettings = context.documentSettings.get(textDoc.uri);

        describe("With EE enabled @ee", () => {
          before(async () => {
            (await docSettings).ansibleLint.enabled = false;
            (await docSettings).ansibleLint.arguments = "-f invalid_argument";
            setFixtureAnsibleCollectionPathEnv(
              "/home/runner/.ansible/collections:/usr/share/ansible",
            );
            await enableExecutionEnvironmentSettings(docSettings);
          });

          testAnsibleSyntaxCheckNoErrors(context, validationManager, textDoc);

          after(async () => {
            (await docSettings).ansibleLint.enabled = true;
            (await docSettings).ansibleLint.arguments = undefined;
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });
        });

        describe("With EE disabled", () => {
          before(async () => {
            (await docSettings).ansibleLint.enabled = false;
            (await docSettings).ansibleLint.arguments = "-f invalid_argument";
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });

          testAnsibleSyntaxCheckNoErrors(context, validationManager, textDoc);
        });
        after(async () => {
          (await docSettings).ansibleLint.enabled = true;
          (await docSettings).ansibleLint.arguments = undefined;
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("no host", () => {
        fixtureFilePath = "diagnostics/noHost.yml";
        fixtureFileUri = resolveDocUri(fixtureFilePath);
        context = workspaceManager.getContext(fixtureFileUri);

        textDoc = getDoc(fixtureFilePath);
        docSettings = context.documentSettings.get(textDoc.uri);

        describe("With EE enabled @ee", () => {
          before(async () => {
            (await docSettings).ansibleLint.enabled = false;
            (await docSettings).ansibleLint.arguments = "-f invalid_argument";
            setFixtureAnsibleCollectionPathEnv(
              "/home/runner/.ansible/collections:/usr/share/ansible",
            );
            await enableExecutionEnvironmentSettings(docSettings);
          });

          testAnsibleSyntaxCheckNoHost(context, validationManager, textDoc);

          after(async () => {
            (await docSettings).ansibleLint.enabled = true;
            (await docSettings).ansibleLint.arguments = undefined;
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });
        });

        describe("With EE disabled", () => {
          before(async () => {
            (await docSettings).ansibleLint.enabled = false;
            (await docSettings).ansibleLint.arguments = "-f invalid_argument";
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });

          testAnsibleSyntaxCheckNoHost(context, validationManager, textDoc);
        });
        after(async () => {
          (await docSettings).ansibleLint.enabled = true;
          (await docSettings).ansibleLint.arguments = undefined;
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });
    });
  });

  describe("YAML diagnostics", () => {
    fixtureFilePath = "diagnostics/invalid_yaml.yml";
    fixtureFileUri = resolveDocUri(fixtureFilePath);
    context = workspaceManager.getContext(fixtureFileUri);

    textDoc = getDoc(fixtureFilePath);
    docSettings = context.documentSettings.get(textDoc.uri);

    describe("With EE enabled @ee", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible",
        );
        await enableExecutionEnvironmentSettings(docSettings);
      });

      testInvalidYamlFile(context, validationManager, textDoc);

      after(async () => {
        setFixtureAnsibleCollectionPathEnv();
        await disableExecutionEnvironmentSettings(docSettings);
      });
    });

    describe("With EE disabled", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv();
        await disableExecutionEnvironmentSettings(docSettings);
      });

      testInvalidYamlFile(context, validationManager, textDoc);
    });
  });
});
