import { expect } from 'chai';
import { Position } from 'vscode-languageserver';
import { doCompletion } from '../../src/providers/completionProvider';
import {} from '../../src/providers/validationProvider';
import {
  createTestWorkspaceManager,
  getDoc,
  setFixtureAnsibleCollectionPathEnv,
  smartFilter,
} from '../helper';

setFixtureAnsibleCollectionPathEnv();

describe('doCompletion()', () => {
  const workspaceManager = createTestWorkspaceManager();

  describe('Completion for play keywords', () => {
    const tests = [
      {
        keyword: 'name',
        position: { line: 0, character: 4 } as Position,
        triggerCharacter: 'na',
      },
      {
        keyword: 'hosts',
        position: { line: 2, character: 5 } as Position,
        triggerCharacter: 'hos',
      },
      {
        keyword: 'module name',
        position: { line: 8, character: 6 } as Position,
        triggerCharacter: 'an',
      },
      {
        keyword: 'suboptions',
        position: { line: 11, character: 12 } as Position,
        triggerCharacter: '',
      },
    ];

    tests.forEach(({ keyword, position, triggerCharacter }) => {
      it(`should provide completion for ${keyword}`, async function () {
        const textDoc = await getDoc('completion/tasks.yml');
        const context = workspaceManager.getContext(textDoc.uri);

        // Update setting to avoid fqcn
        const docSettings = context.documentSettings.get(textDoc.uri);
        const cachedDefaultSetting = (await docSettings).ansible
          .useFullyQualifiedCollectionNames;
        (await docSettings).ansible.useFullyQualifiedCollectionNames = false;

        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter
        );

        filteredCompletion.forEach((item) => {
          item.item ? console.log(item.item.label) : console.log(item.label);
        });
        console.log('\n');

        expect(filteredCompletion).not.to.be.null;

        (await docSettings).ansible.useFullyQualifiedCollectionNames =
          cachedDefaultSetting;
      });
    });
  });
});
