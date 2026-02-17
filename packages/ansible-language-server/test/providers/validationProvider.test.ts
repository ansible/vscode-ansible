import { TextDocument } from "vscode-languageserver-textdocument";
import { expect, beforeAll, afterAll } from "vitest";
import { Diagnostic, Position, integer } from "vscode-languageserver";
import {
  doValidate,
  getYamlValidation,
} from "../../src/providers/validationProvider.js";
import { WorkspaceFolderContext } from "../../src/services/workspaceManager.js";
import {
  createTestValidationManager,
  createTestWorkspaceManager,
  getDoc,
  resolveDocUri,
  enableExecutionEnvironmentSettings,
  disableExecutionEnvironmentSettings,
  setFixtureAnsibleCollectionPathEnv,
} from "../helper.js";
import { ValidationManager } from "../../src/services/validationManager.js";

function testValidationFromCache(
  validationManager: ValidationManager,
  textDoc: TextDocument,
) {
  it("should provide no diagnostics", async function () {
    const actualDiagnostics = await doValidate(textDoc, validationManager);

    expect(actualDiagnostics.size).toBe(0);
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
      expect(context).toBeDefined();
      const actualDiagnostics: Map<string, Diagnostic[]> = await doValidate(
        textDoc,
        validationManager,
        false,
        context,
      );

      if (!validationEnabled) {
        expect(actualDiagnostics.has(`file://${textDoc.uri}`)).toBe(false);
        return;
      }

      if (test.diagnosticReport.length === 0) {
        expect(actualDiagnostics.has(`file://${textDoc.uri}`)).toBe(false);
      } else {
        const diags = actualDiagnostics.get(`file://${textDoc.uri}`);
        if (diags) {
          expect(diags.length).toBe(test.diagnosticReport.length);
          diags.forEach((diag, i) => {
            const actDiag = diag;
            const expDiag = test.diagnosticReport[i];

            expect(actDiag.message).toContain(expDiag.message);
            expect(actDiag.range).toEqual(expDiag.range);
            expect(actDiag.severity).toBe(expDiag.severity);
            expect(actDiag.source).toBe(expDiag.source);
          });
        } else {
          expect(false).toBe(true);
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
            start: { line: 4, character: 4 } as Position,
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
          severity: 1,
          message: "Use FQCN for builtin module actions (command).",
          range: {
            start: { line: 15, character: 6 } as Position,
            end: {
              line: 15,
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
  expect(context).toBeDefined();
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
  expect(context).toBeDefined();
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

          message: "field 'hosts' is required but was not set",
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
      expect(actualDiagnostics.length).toBe(diagnosticReport.length);

      actualDiagnostics.forEach((diag, i) => {
        const actDiag = diag;
        const expDiag = diagnosticReport[i];

        expect(actDiag.message).toContain(expDiag.message);
        expect(actDiag.range).toEqual(expDiag.range);
        expect(actDiag.severity).toBe(expDiag.severity);
        expect(actDiag.source).toBe(expDiag.source);
      });
    });
  });
}

describe("doValidate()", function () {
  const workspaceManager = createTestWorkspaceManager();
  const validationManager = createTestValidationManager();
  let fixtureFilePath = "diagnostics/lint_errors.yml";
  let fixtureFileUri = resolveDocUri(fixtureFilePath);
  let context = workspaceManager.getContext(fixtureFileUri);

  let textDoc = getDoc(fixtureFilePath);
  if (context) {
    let docSettings = context.documentSettings.get(textDoc.uri);

    describe("Get validation only from cache", function () {
      describe("@ee", function () {
        beforeAll(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible/collections",
          );
          await enableExecutionEnvironmentSettings(docSettings, context);
        });

        testValidationFromCache(validationManager, textDoc);

        afterAll(async function () {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings, context);
        });
      });

      describe("@noee", function () {
        beforeAll(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings, context);
        });

        testValidationFromCache(validationManager, textDoc);
      });
    });

    describe("Ansible diagnostics", function () {
      describe("Diagnostics using ansible-lint", function () {
        describe.skip("@ee", function () {
          beforeAll(async () => {
            setFixtureAnsibleCollectionPathEnv(
              "/home/runner/.ansible/collections:/usr/share/ansible/collections",
            );
            await enableExecutionEnvironmentSettings(docSettings, context);
          });

          if (context) {
            testAnsibleLintErrors(context, validationManager, textDoc, true);
          }

          afterAll(async function () {
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings, context);
          });
        });

        describe("@noee", function () {
          beforeAll(async () => {
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings, context);
          });

          testAnsibleLintErrors(context, validationManager, textDoc, true);
        });

        describe("Syntax-check errors in ansible-lint", function () {
          fixtureFilePath =
            "diagnostics/syntax_check_errors_in_ansible_lint.yml";
          fixtureFileUri = resolveDocUri(fixtureFilePath);
          context = workspaceManager.getContext(fixtureFileUri);

          textDoc = getDoc(fixtureFilePath);
          expect(context).toBeDefined();
          if (context) {
            docSettings = context.documentSettings.get(textDoc.uri);

            describe.skip("@ee", function () {
              beforeAll(async () => {
                (await docSettings).validation.lint.enabled = false;
                setFixtureAnsibleCollectionPathEnv(
                  "/home/runner/.ansible/collections:/usr/share/ansible/collections",
                );
                await enableExecutionEnvironmentSettings(docSettings, context);
              });

              testAnsibleSyntaxCheckErrorsInAnsibleLint(
                context,
                validationManager,
                textDoc,
                true,
              );

              afterAll(async function () {
                (await docSettings).validation.lint.enabled = true;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings, context);
              });
            });

            describe("@noee", function () {
              beforeAll(async () => {
                (await docSettings).validation.lint.enabled = false;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings, context);
              });

              testAnsibleSyntaxCheckErrorsInAnsibleLint(
                context,
                validationManager,
                textDoc,
                true,
              );
            });

            afterAll(async function () {
              (await docSettings).validation.lint.enabled = true;
              setFixtureAnsibleCollectionPathEnv();
              await disableExecutionEnvironmentSettings(docSettings, context);
            });
          }
        });
      });

      describe("Auto-fix on save", function () {
        describe("@noee", function () {
          const currentSettings = context?.documentSettings.get(textDoc.uri);

          it("should execute ansible-lint with --fix branch when enabled", async function () {
            if (currentSettings) {
              (await currentSettings).validation.lint.autoFixOnSave = true;
            }
            expect(context).toBeDefined();
            await doValidate(textDoc, validationManager, false, context);
          });

          it("should NOT execute ansible-lint with --fix branch when disabled", async function () {
            if (currentSettings) {
              (await currentSettings).validation.lint.autoFixOnSave = false;
            }
            expect(context).toBeDefined();
            await doValidate(textDoc, validationManager, false, context);
          });

          afterAll(async function () {
            if (currentSettings) {
              (await currentSettings).validation.lint.autoFixOnSave = false;
            }
          });
        });
      });

      describe("When validation is disabled", function () {
        it("should return empty diagnostics", async function () {
          const currentSettings = await context?.documentSettings.get(
            textDoc.uri,
          );
          if (currentSettings) {
            currentSettings.validation.enabled = false;
          }

          const freshUri = `${textDoc.uri}.unique.yml`;
          const freshDoc = {
            ...textDoc,
            uri: freshUri,
            getText: () => "",
          } as TextDocument;

          const result = await doValidate(
            freshDoc,
            validationManager,
            false,
            context,
          );

          const totalDiagnostics = Array.from(result.values()).flat().length;
          expect(totalDiagnostics).toBe(0);
        });

        afterAll(async function () {
          const currentSettings = await context?.documentSettings.get(
            textDoc.uri,
          );
          if (currentSettings) {
            currentSettings.validation.enabled = true;
          }
        });
      });

      describe("Diagnostics using ansible-playbook --syntax-check", function () {
        describe("no specific ansible lint errors", function () {
          fixtureFilePath = "diagnostics/lint_errors.yml";
          fixtureFileUri = resolveDocUri(fixtureFilePath);
          context = workspaceManager.getContext(fixtureFileUri);

          textDoc = getDoc(fixtureFilePath);
          expect(context).toBeDefined();

          if (context) {
            docSettings = context.documentSettings.get(textDoc.uri);

            describe("@ee", function () {
              beforeAll(async () => {
                (await docSettings).validation.lint.enabled = false;
                setFixtureAnsibleCollectionPathEnv(
                  "/home/runner/.ansible/collections:/usr/share/ansible/collections",
                );
                await enableExecutionEnvironmentSettings(docSettings, context);
              });

              testAnsibleSyntaxCheckNoErrors(
                context,
                validationManager,
                textDoc,
                true,
              );

              afterAll(async function () {
                (await docSettings).validation.lint.enabled = true;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings, context);
              });
            });

            describe("@noee", function () {
              beforeAll(async () => {
                (await docSettings).validation.lint.enabled = false;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings, context);
              });

              testAnsibleSyntaxCheckNoErrors(
                context,
                validationManager,
                textDoc,
                true,
              );
            });

            afterAll(async function () {
              (await docSettings).validation.lint.enabled = true;
              setFixtureAnsibleCollectionPathEnv();
              await disableExecutionEnvironmentSettings(docSettings, context);
            });
          }
        });

        describe("empty playbook", function () {
          fixtureFilePath = "diagnostics/empty.yml";
          fixtureFileUri = resolveDocUri(fixtureFilePath);
          context = workspaceManager.getContext(fixtureFileUri);

          textDoc = getDoc(fixtureFilePath);
          expect(context).toBeDefined();
          if (context) {
            docSettings = context.documentSettings.get(textDoc.uri);

            describe("@ee", function () {
              beforeAll(async () => {
                (await docSettings).validation.lint.enabled = false;
                setFixtureAnsibleCollectionPathEnv(
                  "/home/runner/.ansible/collections:/usr/share/ansible/collections",
                );
                await enableExecutionEnvironmentSettings(docSettings, context);
              });

              testAnsibleSyntaxCheckEmptyPlaybook(
                context,
                validationManager,
                textDoc,
                true,
              );

              afterAll(async function () {
                (await docSettings).validation.lint.enabled = true;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings, context);
              });
            });

            describe("@noee", function () {
              beforeAll(async () => {
                (await docSettings).validation.lint.enabled = false;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings, context);
              });

              testAnsibleSyntaxCheckEmptyPlaybook(
                context,
                validationManager,
                textDoc,
                true,
              );
            });

            afterAll(async function () {
              (await docSettings).validation.lint.enabled = true;
              setFixtureAnsibleCollectionPathEnv();
              await disableExecutionEnvironmentSettings(docSettings, context);
            });
          }
        });

        describe("no host", function () {
          fixtureFilePath = "diagnostics/noHost.yml";
          fixtureFileUri = resolveDocUri(fixtureFilePath);
          context = workspaceManager.getContext(fixtureFileUri);

          textDoc = getDoc(fixtureFilePath);
          if (context) {
            docSettings = context.documentSettings.get(textDoc.uri);
          }
          // Skipping this EE test temporarily because of incompatibilities
          // with container version of lint vs upstream version of lint
          describe.skip("@ee", function () {
            beforeAll(async () => {
              (await docSettings).validation.lint.enabled = false;
              setFixtureAnsibleCollectionPathEnv(
                "/home/runner/.ansible/collections:/usr/share/ansible/collections",
              );
              await enableExecutionEnvironmentSettings(docSettings, context);
            });

            testAnsibleSyntaxCheckNoHost(
              context,
              validationManager,
              textDoc,
              true,
            );

            afterAll(async function () {
              (await docSettings).validation.lint.enabled = true;
              setFixtureAnsibleCollectionPathEnv();
              await disableExecutionEnvironmentSettings(docSettings, context);
            });
          });

          describe("@noee", function () {
            beforeAll(async () => {
              (await docSettings).validation.lint.enabled = false;
              setFixtureAnsibleCollectionPathEnv();
              await disableExecutionEnvironmentSettings(docSettings, context);
            });

            testAnsibleSyntaxCheckNoHost(
              context,
              validationManager,
              textDoc,
              true,
            );
          });

          afterAll(async function () {
            (await docSettings).validation.lint.enabled = true;
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings, context);
          });
        });
      });

      describe("Diagnostics when validation is disabled", function () {
        describe("no specific ansible lint errors", function () {
          fixtureFilePath = "diagnostics/lint_errors.yml";
          fixtureFileUri = resolveDocUri(fixtureFilePath);
          context = workspaceManager.getContext(fixtureFileUri);

          textDoc = getDoc(fixtureFilePath);
          expect(context).toBeDefined();
          if (context) {
            docSettings = context.documentSettings.get(textDoc.uri);

            describe("@ee", function () {
              beforeAll(async () => {
                // (await docSettings).validation.lint.enabled = false;
                // (await docSettings).validation.lint.path =
                //   "invalid-ansible-lint-path";
                (await docSettings).validation.enabled = false;
                setFixtureAnsibleCollectionPathEnv(
                  "/home/runner/.ansible/collections:/usr/share/ansible/collections",
                );
                await enableExecutionEnvironmentSettings(docSettings, context);
              });

              testAnsibleSyntaxCheckNoErrors(
                context,
                validationManager,
                textDoc,
                false,
              );

              afterAll(async function () {
                // (await docSettings).validation.lint.enabled = true;
                // (await docSettings).validation.lint.path = "ansible-lint";
                (await docSettings).validation.enabled = true;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings, context);
              });
            });

            describe("@noee", function () {
              beforeAll(async () => {
                // (await docSettings).validation.lint.enabled = false;
                // (await docSettings).validation.lint.path =
                // "invalid-ansible-lint-path";
                (await docSettings).validation.enabled = false;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings, context);
              });

              testAnsibleSyntaxCheckNoErrors(
                context,
                validationManager,
                textDoc,
                false,
              );
            });

            afterAll(async function () {
              // (await docSettings).validation.lint.enabled = true;
              // (await docSettings).validation.lint.path = "ansible-lint";
              (await docSettings).validation.enabled = true;
              setFixtureAnsibleCollectionPathEnv();
              await disableExecutionEnvironmentSettings(docSettings, context);
            });
          }
        });

        describe("no host", function () {
          fixtureFilePath = "diagnostics/noHost.yml";
          fixtureFileUri = resolveDocUri(fixtureFilePath);
          context = workspaceManager.getContext(fixtureFileUri);

          textDoc = getDoc(fixtureFilePath);
          expect(context).toBeDefined();
          if (context) {
            docSettings = context.documentSettings.get(textDoc.uri);

            describe("@ee", function () {
              beforeAll(async () => {
                // (await docSettings).validation.lint.enabled = false;
                // (await docSettings).validation.lint.path =
                //   "invalid-ansible-lint-path";
                (await docSettings).validation.enabled = false;
                setFixtureAnsibleCollectionPathEnv(
                  "/home/runner/.ansible/collections:/usr/share/ansible/collections",
                );
                await enableExecutionEnvironmentSettings(docSettings, context);
              });

              testAnsibleSyntaxCheckNoHost(
                context,
                validationManager,
                textDoc,
                false,
              );

              afterAll(async function () {
                // (await docSettings).validation.lint.enabled = true;
                // (await docSettings).validation.lint.path = "ansible-lint";
                (await docSettings).validation.enabled = true;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings, context);
              });
            });

            describe("@noee", function () {
              beforeAll(async () => {
                // (await docSettings).validation.lint.enabled = false;
                // (await docSettings).validation.lint.path =
                //   "invalid-ansible-lint-path";
                (await docSettings).validation.enabled = false;
                setFixtureAnsibleCollectionPathEnv();
                await disableExecutionEnvironmentSettings(docSettings, context);
              });

              testAnsibleSyntaxCheckNoHost(
                context,
                validationManager,
                textDoc,
                false,
              );
            });

            afterAll(async function () {
              // (await docSettings).validation.lint.enabled = true;
              // (await docSettings).validation.lint.path = "ansible-lint";
              (await docSettings).validation.enabled = true;
              setFixtureAnsibleCollectionPathEnv();
              await disableExecutionEnvironmentSettings(docSettings, context);
            });
          }
        });
      });
    });

    describe("YAML diagnostics", function () {
      fixtureFilePath = "diagnostics/invalid_yaml.yml";
      fixtureFileUri = resolveDocUri(fixtureFilePath);
      context = workspaceManager.getContext(fixtureFileUri);

      textDoc = getDoc(fixtureFilePath);
      expect(context).toBeDefined();
      if (context) {
        docSettings = context.documentSettings.get(textDoc.uri);

        describe("@ee", function () {
          beforeAll(async () => {
            setFixtureAnsibleCollectionPathEnv(
              "/home/runner/.ansible/collections:/usr/share/ansible/collections",
            );
            await enableExecutionEnvironmentSettings(docSettings, context);
          });

          testInvalidYamlFile(textDoc);

          afterAll(async function () {
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings, context);
          });
        });

        describe("@noee", function () {
          beforeAll(async () => {
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings, context);
          });

          testInvalidYamlFile(textDoc);
        });
      }
    });
  }
});
