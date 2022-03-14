import { expect } from "chai";
import { Position, integer } from "vscode-languageserver";
import {
  doValidate,
  getYamlValidation,
} from "../../src/providers/validationProvider";
import {
  createTestValidationManager,
  createTestWorkspaceManager,
  getDoc,
  setFixtureAnsibleCollectionPathEnv,
} from "../helper";

setFixtureAnsibleCollectionPathEnv();

describe("doValidate()", () => {
  const workspaceManager = createTestWorkspaceManager();
  const validationManager = createTestValidationManager();

  describe("Get validation only from cache", () => {
    it("should provide no diagnostics", async function () {
      const textDoc = await getDoc("diagnostics/lint_errors.yml");

      const actualDiagnostics = await doValidate(textDoc, validationManager);

      expect(actualDiagnostics.size).to.equal(0);
    });
  });

  describe("Ansible diagnostics", () => {
    describe("Diagnostics using ansible-lint", () => {
      const tests = [
        {
          name: "specific ansible lint errors",
          file: "diagnostics/lint_errors.yml",
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
              // eslint-disable-next-line quotes
              message: "Don't compare to empty string",
              range: {
                start: { line: 9, character: 0 } as Position,
                end: {
                  line: 9,
                  character: integer.MAX_VALUE,
                } as Position,
              },
              source: "Ansible",
            },
            {
              severity: 1,
              message:
                "Commands should not change things if nothing needs doing",
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
        {
          name: "empty playbook",
          file: "diagnostics/empty.yml",
          diagnosticReport: [
            {
              severity: 1,
              message: "[syntax-check] Empty playbook, nothing to do",
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
        {
          name: "no host",
          file: "diagnostics/noHost.yml",
          diagnosticReport: [
            {
              severity: 1,
              message: "[syntax-check] Ansible syntax check failed",
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

      tests.forEach(({ name, file, diagnosticReport }) => {
        it(`should provide diagnostics for ${name}`, async function () {
          const textDoc = await getDoc(file);
          const context = workspaceManager.getContext(textDoc.uri);

          const actualDiagnostics = await doValidate(
            textDoc,
            validationManager,
            false,
            context
          );

          if (diagnosticReport.length === 0) {
            expect(actualDiagnostics.has(`file://${textDoc.uri}`)).to.be.false;
          } else {
            expect(
              actualDiagnostics.get(`file://${textDoc.uri}`).length
            ).to.equal(diagnosticReport.length);

            actualDiagnostics
              .get(`file://${textDoc.uri}`)
              .forEach((diag, i) => {
                const actDiag = diag;
                const expDiag = diagnosticReport[i];

                expect(actDiag.message).include(expDiag.message);
                expect(actDiag.range).to.deep.equal(expDiag.range);
                expect(actDiag.severity).to.equal(expDiag.severity);
                expect(actDiag.source).to.equal(expDiag.source);
              });
          }
        });
      });
    });

    describe("Diagnostics after falling back to --syntax-check due to change in settings", () => {
      const tests = [
        {
          name: "no specific ansible lint errors",
          file: "diagnostics/lint_errors.yml",
          diagnosticReport: [],
        },
        {
          name: "empty playbook",
          file: "diagnostics/empty.yml",
          diagnosticReport: [],
        },
        {
          name: "no host",
          file: "diagnostics/noHost.yml",
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

      tests.forEach(({ name, file, diagnosticReport }) => {
        it(`should provide diagnostics for ${name}`, async function () {
          const textDoc = await getDoc(file);
          const context = workspaceManager.getContext(textDoc.uri);

          //   Update setting to disable ansible-lint
          const docSettings = context.documentSettings.get(textDoc.uri);
          const cachedDefaultSetting = (await docSettings).ansibleLint.enabled;
          (await docSettings).ansibleLint.enabled = false;

          const actualDiagnostics = await doValidate(
            textDoc,
            validationManager,
            false,
            context
          );

          if (diagnosticReport.length === 0) {
            expect(actualDiagnostics.has(`file://${textDoc.uri}`)).to.be.false;
          } else {
            expect(
              actualDiagnostics.get(`file://${textDoc.uri}`).length
            ).to.equal(diagnosticReport.length);

            actualDiagnostics
              .get(`file://${textDoc.uri}`)
              .forEach((diag, i) => {
                const actDiag = diag;
                const expDiag = diagnosticReport[i];

                expect(actDiag.message).include(expDiag.message);
                expect(actDiag.range).to.deep.equal(expDiag.range);
                expect(actDiag.severity).to.equal(expDiag.severity);
                expect(actDiag.source).to.equal(expDiag.source);
              });
          }

          (await docSettings).ansibleLint.enabled = cachedDefaultSetting;
        });
      });
    });
    describe("Diagnostics after falling back to --syntax-check due to unavailability of ansible-lint", () => {
      const tests = [
        {
          name: "no specific ansible lint errors",
          file: "diagnostics/lint_errors.yml",
          diagnosticReport: [],
        },
        {
          name: "no host",
          file: "diagnostics/noHost.yml",
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

      tests.forEach(({ name, file, diagnosticReport }) => {
        it(`should provide diagnostics for ${name}`, async function () {
          const textDoc = await getDoc(file);
          const context = workspaceManager.getContext(textDoc.uri);

          //   Update setting to disable ansible-lint
          const docSettings = context.documentSettings.get(textDoc.uri);
          const cachedDefaultSetting = (await docSettings).ansibleLint.path;
          (await docSettings).ansibleLint.path = "invalid-ansible-lint-path";

          const actualDiagnostics = await doValidate(
            textDoc,
            validationManager,
            false,
            context
          );

          if (diagnosticReport.length === 0) {
            expect(actualDiagnostics.has(`file://${textDoc.uri}`)).to.be.false;
          } else {
            expect(
              actualDiagnostics.get(`file://${textDoc.uri}`).length
            ).to.equal(diagnosticReport.length);

            actualDiagnostics
              .get(`file://${textDoc.uri}`)
              .forEach((diag, i) => {
                const actDiag = diag;
                const expDiag = diagnosticReport[i];

                expect(actDiag.message).include(expDiag.message);
                expect(actDiag.range).to.deep.equal(expDiag.range);
                expect(actDiag.severity).to.equal(expDiag.severity);
                expect(actDiag.source).to.equal(expDiag.source);
              });
          }

          // Revert setting
          (await docSettings).ansibleLint.path = cachedDefaultSetting;
        });
      });
    });

    describe("Diagnostics after falling back to --syntax-check due to failure in execution of ansible-lint command", () => {
      const tests = [
        {
          name: "no specific ansible lint errors",
          file: "diagnostics/lint_errors.yml",
          diagnosticReport: [],
        },
        {
          name: "no host",
          file: "diagnostics/noHost.yml",
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

      tests.forEach(({ name, file, diagnosticReport }) => {
        it(`should provide diagnostics for ${name}`, async function () {
          const textDoc = await getDoc(file);
          const context = workspaceManager.getContext(textDoc.uri);

          //   Update setting to make the ansible-lint command fail
          const docSettings = context.documentSettings.get(textDoc.uri);
          const cachedDefaultSetting = (await docSettings).ansibleLint
            .arguments;
          (await docSettings).ansibleLint.arguments = "-f invalid_argument";

          const actualDiagnostics = await doValidate(
            textDoc,
            validationManager,
            false,
            context
          );

          if (diagnosticReport.length === 0) {
            expect(actualDiagnostics.has(`file://${textDoc.uri}`)).to.be.false;
          } else {
            expect(
              actualDiagnostics.get(`file://${textDoc.uri}`).length
            ).to.equal(diagnosticReport.length);

            actualDiagnostics
              .get(`file://${textDoc.uri}`)
              .forEach((diag, i) => {
                const actDiag = diag;
                const expDiag = diagnosticReport[i];

                expect(actDiag.message).include(expDiag.message);
                expect(actDiag.range).to.deep.equal(expDiag.range);
                expect(actDiag.severity).to.equal(expDiag.severity);
                expect(actDiag.source).to.equal(expDiag.source);
              });
          }

          (await docSettings).ansibleLint.arguments = cachedDefaultSetting;
        });
      });
    });
  });

  describe("YAML diagnostics", () => {
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

    tests.forEach(({ name, file, diagnosticReport }) => {
      it(`should provide diagnostic for ${name}`, async function () {
        const textDoc = await getDoc(file);

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
  });
});
