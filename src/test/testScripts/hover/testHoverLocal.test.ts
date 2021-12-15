import * as vscode from 'vscode';
import {
  getDocUri,
  activate,
  testHover,
  resetDefaultSettings,
} from '../../helper';

export function testHoverLocal(): void {
  describe('TEST FOR HOVER', () => {
    const docUri1 = getDocUri('hover/1.yml');

    before(async () => {
      await resetDefaultSettings();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await activate(docUri1);
    });

    describe('Hover for play keyworks', () => {
      it('should hover over `name` keyword', async () => {
        await testHover(docUri1, new vscode.Position(0, 4), [
          {
            contents: [
              'Identifier. Can be used for documentation, or in tasks/handlers.',
            ],
          },
        ]);
      });

      it('should hover over `hosts` keyword', async () => {
        await testHover(docUri1, new vscode.Position(2, 4), [
          {
            contents: [
              'A list of groups, hosts or host pattern that translates into a list of hosts that are the play’s target.',
            ],
          },
        ]);
      });

      it('should hover over `tasks` keyword', async () => {
        await testHover(docUri1, new vscode.Position(3, 4), [
          {
            contents: [
              'Main list of tasks to execute in the play, they run after roles and before post_tasks.',
            ],
          },
        ]);
      });
    });

  });
}
