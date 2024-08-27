import { TextDocument } from "vscode-languageserver-textdocument";
import { expect } from "chai";
import { Diagnostic, Position, integer } from "vscode-languageserver";
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
  tests: testType[],
  context: WorkspaceFolderContext | undefined,
  validationManager: ValidationManager,
  textDoc: TextDocument,
  validationEnabled: boolean,
) {
  tests.forEach((test) => {
    it(`should provide diagnostics for ${test.name}`, async function () {
      expect(context).is.not.undefined;
      const actualDiagnostics: Map<string, Diagnostic[]> = await doValidate(
        textDoc,
        validationManager,
        false,
        context,
      );

      if (!validationEnabled) {
        expect(actualDiagnostics.has(`file://${textDoc.uri}`)).to.be.false;
        return;
      }

      if (test.diagnosticReport.length === 0) {
        expect(actualDiagnostics.has(`file://${textDoc.uri}`)).to.be.false;
      } else {
        const diags = actualDiagnostics.get(`file://${textDoc.uri}`);
        if (diags) {
          expect(diags.length).to.equal(test.diagnosticReport.length);
          diags.forEach((diag, i) => {
            const actDiag = diag;
            const expDiag = test.diagnosticReport[i];

            expect(actDiag.message).include(expDiag.message);
            expect(actDiag.range).to.deep.equal(expDiag.range);
            expect(actDiag.severity).to.equal(expDiag.severity);
            expect(actDiag.source).to.equal(expDiag.source);
          });
        } else {
          expect(false);
        }
      }
    });
  });
}

type testType = {
  name: string;
  diagnosticReport: Diagnostic[];
};

function testAnsibleLintErrors(
  context: WorkspaceFolderContext | undefined,
  validationManager: ValidationManager,
  textDoc: TextDocument,
  validationEnabled: boolean,
) {
  const tests: testType[] = [
    {
      name: "specific ansible lint errors and warnings (Warnings come from warn_list in ansible-lint config)",
      diagnosticReport: [
        {
          severity: 1,
          message: "Variables names",
          range: {
            start: { line: 4, character: 0 } as Position,
            end: {
              line: 4,
              character: integer.MAX_VALUE,
            } as Position,
          },
          source: "ansible-lint",
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
          source: "ansible-lint",
        },
        {
          severity: 1,
          message: "Use FQCN for builtin module actions",
          range: {
            start: { line: 14, character: 0 } as Position,
            end: {
              line: 14,
              character: integer.MAX_VALUE,
            } as Position,
          },
          source: "ansible-lint",
        },
        {
          severity: 1,
          message:
            "Command module does not accept setting environment variables inline.",
          range: {
            start: { line: 14, character: 0 } as Position,
            end: {
              line: 14,
              character: integer.MAX_VALUE,
            } as Position,
          },
          source: "ansible-lint",
        },
        {
          severity: 1,
          message: "Commands should not change things if nothing needs doing.",
          range: {
            start: { line: 14, character: 0 } as Position,
            end: {
              line: 14,
              character: integer.MAX_VALUE,
            } as Position,
          },
          source: "ansible-lint",
        },
        {
          severity: 2,
          message: "should not use a relative path",
          range: {
            start: { line: 18, character: 0 } as Position,
            end: {
              line: 18,
              character: integer.MAX_VALUE,
            } as Position,
          },
          source: "ansible-lint",
        },
      ],
    },
  ];
  assertValidateTests(
    tests,
    context,
    validationManager,
    textDoc,
    validationEnabled,
  );
}

function testAnsibleSyntaxCheckErrorsInAnsibleLint(
  context: WorkspaceFolderContext | undefined,
  validationManager: ValidationManager,
  textDoc: TextDocument,
  validationEnabled: boolean,
) {
  const tests: testType[] = [
    {
      name: "syntax-check errors in ansible-lint",
      diagnosticReport: [
        {
          severity: 1,
          message: "--syntax-check",
          range: {
            start: { line: 1, character: 2 } as Position,
            end: {
              line: 1,
              character: integer.MAX_VALUE,
            } as Position,
          },
          source: "Ansible",
        },
      ],
    },
  ];
  expect(context).to.not.be.undefined;
  if (context) {
    assertValidateTests(
      tests,
      context,
      validationManager,
      textDoc,
      validationEnabled,
    );
  }
}

function testAnsibleSyntaxCheckNoErrors(
  context: WorkspaceFolderContext | undefined,
  validationManager: ValidationManager,
  textDoc: TextDocument,
  validationEnabled: boolean,
) {
  const tests = [
    {
      name: "no specific ansible lint errors",
      diagnosticReport: [],
    },
  ];
  expect(context).to.not.be.undefined;
  if (context) {
    assertValidateTests(
      tests,
      context,
      validationManager,
      textDoc,
      validationEnabled,
    );
  }
}

function testAnsibleSyntaxCheckEmptyPlaybook(
  context: WorkspaceFolderContext | undefined,
  validationManager: ValidationManager,
  textDoc: TextDocument,
  validationEnabled: boolean,
) {
  const tests = [
    {
      name: "empty playbook",
      diagnosticReport: [],
    },
  ];
  assertValidateTests(
    tests,
    context,
    validationManager,
    textDoc,
    validationEnabled,
  );
}

function testAnsibleSyntaxCheckNoHost(
  context: WorkspaceFolderContext | undefined,
  validationManager: ValidationManager,
  textDoc: TextDocument,
  validationEnabled: boolean,
) {
  const tests: testType[] = [
    {
      name: "no host",
      diagnosticReport: [
        {
          severity: 1,

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
  assertValidateTests(
    tests,
    context,
    validationManager,
    textDoc,
    validationEnabled,
  );
}

function testInvalidYamlFile(textDoc: TextDocument) {
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
              character: 14,
            } as Position,
          },
          source: "Ansible [YAML]",
        },
        {
          severity: 1,
          message: "Unexpected scalar at node end",
          range: {
            start: { line: 7, character: 0 } as Position,
            end: {
              line: 7,
              character: 6,
            } as Position,
          },
          source: "Ansible [YAML]",
        },
        {
          severity: 1,
          message: "Unexpected map-value-ind",
          range: {
            start: { line: 7, character: 6 } as Position,
            end: {
              line: 7,
              character: 7,
            } as Position,
          },
          source: "Ansible [YAML]",
        },
        {
          severity: 1,
          message: "Unexpected scalar token in YAML stream",
          range: {
            start: { line: 7, character: 8 } as Position,
            end: {
              line: 7,
              character: 12,
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
  if (context) {
    let docSettings = context.documentSettings.get(textDoc.uri);

    describe("Get validation only from cache", () => {
      describe("With EE enabled @ee", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible/collections",
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
              "/home/runner/.ansible/collections:/usr/share/ansible/collections",
            );
            await enableExecutionEnvironmentSettings(docSettings);
          });

          if (context) {
            testAnsibleLintErrors(context, validationManager, textDoc, true);
          }

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

          testAnsibleLintErrors(context, validationManager, textDoc, true);
        });

        describe("Syntax-check errors in ansible-lint", () => {
          fixtureFilePath =
            "diagnostics/syntax_check_errors_in_ansible_lint.yml";
          fixtureFileUri = resolveDocUri(fixtureFilePath);
          context = workspaceManager.getContext(fixtureFileUri);

          textDoc = getDoc(fixtureFilePath);
          expect(context).is.not.undefined;
          if (context) {
            docSettings = context.documentSettings.get(textDoc.uri);

            describe("With EE enabled @ee", () => {
              before(async () => {
                (await docSettings).validation.lint.enabled = false;
                setFixtureAnsibleCollectionPathEnv(
                  "/home/runner/.ansible/collections:/usr/share/ansible/collections",
                );
                await enableExecutionEnvironmentSettings(docSettings);
              });

              testAnsibleSyntaxCheckErrorsInAnsibleLint(
                context,
                validationManager,
                textDoc,
                true,
              );

              after(async () => {
                (await docSettings).validation.lint.enabled = true;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings);
              });
            });

            describe("With EE disabled", () => {
              before(async () => {
                (await docSettings).validation.lint.enabled = false;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings);
              });

              testAnsibleSyntaxCheckErrorsInAnsibleLint(
                context,
                validationManager,
                textDoc,
                true,
              );
            });
            after(async () => {
              (await docSettings).validation.lint.enabled = true;
              setFixtureAnsibleCollectionPathEnv();
              await disableExecutionEnvironmentSettings(docSettings);
            });
          }
        });
      });

      describe("Diagnostics using ansible-playbook --syntax-check", () => {
        describe("no specific ansible lint errors", () => {
          fixtureFilePath = "diagnostics/lint_errors.yml";
          fixtureFileUri = resolveDocUri(fixtureFilePath);
          context = workspaceManager.getContext(fixtureFileUri);

          textDoc = getDoc(fixtureFilePath);
          expect(context).is.not.undefined;

          if (context) {
            docSettings = context.documentSettings.get(textDoc.uri);

            describe("With EE enabled @ee", () => {
              before(async () => {
                (await docSettings).validation.lint.enabled = false;
                setFixtureAnsibleCollectionPathEnv(
                  "/home/runner/.ansible/collections:/usr/share/ansible/collections",
                );
                await enableExecutionEnvironmentSettings(docSettings);
              });

              testAnsibleSyntaxCheckNoErrors(
                context,
                validationManager,
                textDoc,
                true,
              );

              after(async () => {
                (await docSettings).validation.lint.enabled = true;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings);
              });
            });

            describe("With EE disabled", () => {
              before(async () => {
                (await docSettings).validation.lint.enabled = false;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings);
              });

              testAnsibleSyntaxCheckNoErrors(
                context,
                validationManager,
                textDoc,
                true,
              );
            });
            after(async () => {
              (await docSettings).validation.lint.enabled = true;
              setFixtureAnsibleCollectionPathEnv();
              await disableExecutionEnvironmentSettings(docSettings);
            });
          }
        });

        describe("empty playbook", () => {
          fixtureFilePath = "diagnostics/empty.yml";
          fixtureFileUri = resolveDocUri(fixtureFilePath);
          context = workspaceManager.getContext(fixtureFileUri);

          textDoc = getDoc(fixtureFilePath);
          expect(context).is.not.undefined;
          if (context) {
            docSettings = context.documentSettings.get(textDoc.uri);

            describe("With EE enabled @ee", () => {
              before(async () => {
                (await docSettings).validation.lint.enabled = false;
                setFixtureAnsibleCollectionPathEnv(
                  "/home/runner/.ansible/collections:/usr/share/ansible/collections",
                );
                await enableExecutionEnvironmentSettings(docSettings);
              });

              testAnsibleSyntaxCheckEmptyPlaybook(
                context,
                validationManager,
                textDoc,
                true,
              );

              after(async () => {
                (await docSettings).validation.lint.enabled = true;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings);
              });
            });

            describe("With EE disabled", () => {
              before(async () => {
                (await docSettings).validation.lint.enabled = false;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings);
              });

              testAnsibleSyntaxCheckEmptyPlaybook(
                context,
                validationManager,
                textDoc,
                true,
              );
            });
            after(async () => {
              (await docSettings).validation.lint.enabled = true;
              setFixtureAnsibleCollectionPathEnv();
              await disableExecutionEnvironmentSettings(docSettings);
            });
          }
        });

        describe("no host", () => {
          fixtureFilePath = "diagnostics/noHost.yml";
          fixtureFileUri = resolveDocUri(fixtureFilePath);
          context = workspaceManager.getContext(fixtureFileUri);

          textDoc = getDoc(fixtureFilePath);
          if (context) {
            docSettings = context.documentSettings.get(textDoc.uri);
          }

          describe("With EE enabled @ee", () => {
            before(async () => {
              (await docSettings).validation.lint.enabled = false;
              setFixtureAnsibleCollectionPathEnv(
                "/home/runner/.ansible/collections:/usr/share/ansible/collections",
              );
              await enableExecutionEnvironmentSettings(docSettings);
            });

            testAnsibleSyntaxCheckNoHost(
              context,
              validationManager,
              textDoc,
              true,
            );

            after(async () => {
              (await docSettings).validation.lint.enabled = true;
              setFixtureAnsibleCollectionPathEnv();
              await disableExecutionEnvironmentSettings(docSettings);
            });
          });

          describe("With EE disabled", () => {
            before(async () => {
              (await docSettings).validation.lint.enabled = false;
              setFixtureAnsibleCollectionPathEnv();
              await disableExecutionEnvironmentSettings(docSettings);
            });

            testAnsibleSyntaxCheckNoHost(
              context,
              validationManager,
              textDoc,
              true,
            );
          });
          after(async () => {
            (await docSettings).validation.lint.enabled = true;
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });
        });
      });

      describe("Diagnostics when validation is disabled", () => {
        describe("no specific ansible lint errors", () => {
          fixtureFilePath = "diagnostics/lint_errors.yml";
          fixtureFileUri = resolveDocUri(fixtureFilePath);
          context = workspaceManager.getContext(fixtureFileUri);

          textDoc = getDoc(fixtureFilePath);
          expect(context).is.not.undefined;
          if (context) {
            docSettings = context.documentSettings.get(textDoc.uri);

            describe("With EE enabled @ee", () => {
              before(async () => {
                // (await docSettings).validation.lint.enabled = false;
                // (await docSettings).validation.lint.path =
                //   "invalid-ansible-lint-path";
                (await docSettings).validation.enabled = false;
                setFixtureAnsibleCollectionPathEnv(
                  "/home/runner/.ansible/collections:/usr/share/ansible/collections",
                );
                await enableExecutionEnvironmentSettings(docSettings);
              });

              testAnsibleSyntaxCheckNoErrors(
                context,
                validationManager,
                textDoc,
                false,
              );

              after(async () => {
                // (await docSettings).validation.lint.enabled = true;
                // (await docSettings).validation.lint.path = "ansible-lint";
                (await docSettings).validation.enabled = true;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings);
              });
            });

            describe("With EE disabled", () => {
              before(async () => {
                // (await docSettings).validation.lint.enabled = false;
                // (await docSettings).validation.lint.path =
                // "invalid-ansible-lint-path";
                (await docSettings).validation.enabled = false;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings);
              });

              testAnsibleSyntaxCheckNoErrors(
                context,
                validationManager,
                textDoc,
                false,
              );
            });
            after(async () => {
              // (await docSettings).validation.lint.enabled = true;
              // (await docSettings).validation.lint.path = "ansible-lint";
              (await docSettings).validation.enabled = true;
              setFixtureAnsibleCollectionPathEnv();
              await disableExecutionEnvironmentSettings(docSettings);
            });
          }
        });

        describe("no host", () => {
          fixtureFilePath = "diagnostics/noHost.yml";
          fixtureFileUri = resolveDocUri(fixtureFilePath);
          context = workspaceManager.getContext(fixtureFileUri);

          textDoc = getDoc(fixtureFilePath);
          expect(context).is.not.undefined;
          if (context) {
            docSettings = context.documentSettings.get(textDoc.uri);

            describe("With EE enabled @ee", () => {
              before(async () => {
                // (await docSettings).validation.lint.enabled = false;
                // (await docSettings).validation.lint.path =
                //   "invalid-ansible-lint-path";
                (await docSettings).validation.enabled = false;
                setFixtureAnsibleCollectionPathEnv(
                  "/home/runner/.ansible/collections:/usr/share/ansible/collections",
                );
                await enableExecutionEnvironmentSettings(docSettings);
              });

              testAnsibleSyntaxCheckNoHost(
                context,
                validationManager,
                textDoc,
                false,
              );

              after(async () => {
                // (await docSettings).validation.lint.enabled = true;
                // (await docSettings).validation.lint.path = "ansible-lint";
                (await docSettings).validation.enabled = true;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings);
              });
            });

            describe("With EE disabled", () => {
              before(async () => {
                // (await docSettings).validation.lint.enabled = false;
                // (await docSettings).validation.lint.path =
                //   "invalid-ansible-lint-path";
                (await docSettings).validation.enabled = false;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings);
              });

              testAnsibleSyntaxCheckNoHost(
                context,
                validationManager,
                textDoc,
                false,
              );
            });
            after(async () => {
              // (await docSettings).validation.lint.enabled = true;
              // (await docSettings).validation.lint.path = "ansible-lint";
              (await docSettings).validation.enabled = true;
              setFixtureAnsibleCollectionPathEnv();
              await disableExecutionEnvironmentSettings(docSettings);
            });
          }
        });
      });
    });

    describe("YAML diagnostics", () => {
      fixtureFilePath = "diagnostics/invalid_yaml.yml";
      fixtureFileUri = resolveDocUri(fixtureFilePath);
      context = workspaceManager.getContext(fixtureFileUri);

      textDoc = getDoc(fixtureFilePath);
      expect(context).is.not.undefined;
      if (context) {
        docSettings = context.documentSettings.get(textDoc.uri);
        describe("With EE enabled @ee", () => {
          before(async () => {
            setFixtureAnsibleCollectionPathEnv(
              "/home/runner/.ansible/collections:/usr/share/ansible/collections",
            );
            await enableExecutionEnvironmentSettings(docSettings);
          });

          testInvalidYamlFile(textDoc);

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

          testInvalidYamlFile(textDoc);
        });
      }
    });
  }
});
