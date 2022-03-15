import { expect } from 'chai';
import { tests } from 'vscode';
import { Position } from 'vscode-languageserver';
import {
  doCompletion,
  doCompletionResolve,
} from '../../src/providers/completionProvider';
import {} from '../../src/providers/validationProvider';
import {
  createTestWorkspaceManager,
  getDoc,
  setFixtureAnsibleCollectionPathEnv,
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
    ];

    tests.forEach(({ keyword, position, triggerCharacter }) => {
      it(`should provide completion for ${keyword}`, async function () {
        const textDoc = await getDoc('completion/tasks.yml');
        const context = workspaceManager.getContext(textDoc.uri);

        const actualCompletion = await doCompletion(textDoc, position, context);
        const filteredCompletion = actualCompletion.filter((item) => {
          return item.filterText
            ? item.filterText.includes(triggerCharacter)
            : item.label.includes(triggerCharacter);
        });

        console.log(
          'ACTUAL -> ',
          actualCompletion.sort((a, b) => a.sortText.localeCompare(b.sortText))
        );
        console.log(' *********** FILTERED -> ', filteredCompletion);

        expect(filteredCompletion).not.to.be.null;
      });
    });
  });

  // it('Testing the completion', async function () {
  //   const textDoc = await getDoc('completion/tasks.yml');
  //   const context = workspaceManager.getContext(textDoc.uri);

  //   const position = { line: 5, character: 10 } as Position;

  //   //   Update setting to avoid fqcn
  //   const docSettings = context.documentSettings.get(textDoc.uri);
  //   const cachedDefaultSetting = (await docSettings).ansible
  //     .useFullyQualifiedCollectionNames;
  //   (await docSettings).ansible.useFullyQualifiedCollectionNames = true;

  //   const actualCompletion = await doCompletion(textDoc, position, context);

  //   const actualCompletionResolve = await doCompletionResolve(
  //     actualCompletion[0],
  //     context
  //   );

  //   console.log('HELLO -> ', actualCompletionResolve);

  //   // actualCompletion.forEach((item) => {
  //   //   console.log('*** -> ', item.label);
  //   // });

  //   // const filteredCompletion = actualCompletion.filter((item) => {
  //   //   if (item.filterText) {
  //   //     return item.filterText.includes('prefix_list');
  //   //   }
  //   // });

  //   // filteredCompletion.forEach((item) => {
  //   //   console.log(`*** ${item.data.moduleFqcn} -> `, item.label);
  //   // });
  //   expect(actualCompletion).not.to.be.null;

  //   (await docSettings).ansible.useFullyQualifiedCollectionNames =
  //     cachedDefaultSetting;
  // });
});
