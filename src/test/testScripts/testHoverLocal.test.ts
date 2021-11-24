/* eslint-disable quotes */
import * as vscode from 'vscode';
import {
  getDocUri,
  activate,
  testHover,
  sleep,
  resetDefaultSettings,
} from '../helper';

describe('TEST FOR HOVER IN LOCAL ENVIRONMENT (without ee)', () => {
  const docUri1 = getDocUri('hover/1.yml');

  beforeEach(async () => {
    await resetDefaultSettings();
    // await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  afterEach(async () => {
    await resetDefaultSettings();
  });

  describe('Hover for play keyworks', () => {
    before(async () => {
      activate(docUri1);
      await sleep(1000);
    });

    it("should hover over 'name' keyword", async () => {
      await testHover(docUri1, new vscode.Position(0, 4), [
        {
          contents: [
            'Identifier. Can be used for documentation, or in tasks/handlers.',
          ],
        },
      ]);
    });

    it("should hover over 'hosts' keyword", async () => {
      await testHover(docUri1, new vscode.Position(2, 4), [
        {
          contents: [
            'A list of groups, hosts or host pattern that translates into a list of hosts that are the play’s target.',
          ],
        },
      ]);
    });

    it("should hover over 'tasks' keyword", async () => {
      await testHover(docUri1, new vscode.Position(3, 4), [
        {
          contents: [
            'Main list of tasks to execute in the play, they run after roles and before post_tasks.',
          ],
        },
      ]);
    });
  });

  describe('Hover for task keyworks', () => {
    before(async () => {
      activate(docUri1);
      await sleep(1000);
    });

    it('should hover over module name', async () => {
      await testHover(docUri1, new vscode.Position(4, 7), [
        {
          contents: ['Prefix-Lists resource module for VyOS'],
        },
      ]);
    });

    it('should hover over task keyword', async () => {
      await testHover(docUri1, new vscode.Position(15, 7), [
        {
          contents: [
            'Name of variable that will contain task status and module return data.',
          ],
        },
      ]);
    });
  });

  describe('Hover for module options and sub-options', () => {
    before(async () => {
      activate(docUri1);
      await sleep(1000);
    });

    it('should hover over module option (config)', async () => {
      await testHover(docUri1, new vscode.Position(5, 9), [
        {
          contents: ['A list of prefix-list options'],
        },
      ]);
    });

    it('should hover over module sub-option (config -> afi)', async () => {
      await testHover(docUri1, new vscode.Position(6, 13), [
        {
          contents: ['The Address Family Indicator (AFI) for the prefix-lists'],
        },
      ]);
    });

    it('should hover over module sub-option (config -> prefix_lists -> entries -> description)', async () => {
      await testHover(docUri1, new vscode.Position(14, 21), [
        {
          contents: ['A brief text description for the prefix list rule'],
        },
      ]);
    });
  });
});
