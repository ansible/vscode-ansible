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
        name: 'name',
        position: { line: 0, character: 2 } as Position,
        triggerCharacter: '',
        completion: 'name',
      },
      {
        name: 'hosts',
        position: { line: 2, character: 5 } as Position,
        triggerCharacter: 'hos',
        completion: 'hosts',
      },
    ];

    tests.forEach(({ name, position, triggerCharacter, completion }) => {
      it(`should provide completion for ${name}`, async function () {
        const textDoc = await getDoc('completion/simple_tasks.yml');
        const context = workspaceManager.getContext(textDoc.uri);

        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter
        );

        filteredCompletion.forEach((item) => {
          item.item ? console.log(item.item.label) : console.log(item.label);
        });
        console.log('\n');

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          if (!filteredCompletion[0].item) {
            expect(filteredCompletion[0].label).be.equal(completion);
          } else {
            expect(filteredCompletion[0].item.label).to.be.equal(completion);
          }
        }
      });
    });
  });

  describe('Completion for role keywords', () => {
    const tests = [
      {
        name: 'name',
        position: { line: 4, character: 6 } as Position,
        triggerCharacter: '',
        completion: 'name',
      },
      {
        name: 'when',
        position: { line: 5, character: 8 } as Position,
        triggerCharacter: 'wh',
        completion: 'when',
      },
    ];

    tests.forEach(({ name, position, triggerCharacter, completion }) => {
      it(`should provide completion for ${name}`, async function () {
        const textDoc = await getDoc('completion/with_roles.yml');
        const context = workspaceManager.getContext(textDoc.uri);

        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter
        );

        filteredCompletion.forEach((item) => {
          item.item ? console.log(item.item.label) : console.log(item.label);
        });
        console.log('\n');

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          if (!filteredCompletion[0].item) {
            expect(filteredCompletion[0].label).be.equal(completion);
          } else {
            expect(filteredCompletion[0].item.label).to.be.equal(completion);
          }
        }
      });
    });
  });

  describe('Completion for block keywords', () => {
    const tests = [
      {
        name: 'become_user',
        position: { line: 8, character: 13 } as Position,
        triggerCharacter: 'user',
        completion: 'become_user',
      },
      {
        name: 'become',
        position: { line: 7, character: 8 } as Position,
        triggerCharacter: 'be',
        completion: 'become',
      },
    ];

    tests.forEach(({ name, position, triggerCharacter, completion }) => {
      it(`should provide completion for ${name}`, async function () {
        const textDoc = await getDoc('completion/with_blocks.yml');
        const context = workspaceManager.getContext(textDoc.uri);

        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter
        );

        filteredCompletion.forEach((item) => {
          item.item ? console.log(item.item.label) : console.log(item.label);
        });
        console.log('\n');

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          if (!filteredCompletion[0].item) {
            expect(filteredCompletion[0].label).be.equal(completion);
          } else {
            expect(filteredCompletion[0].item.label).to.be.equal(completion);
          }
        }
      });
    });
  });

  describe('Completion for task keywords', () => {
    const tests = [
      {
        name: 'loop',
        position: { line: 10, character: 9 } as Position,
        triggerCharacter: 'loop',
        completion: 'loop',
      },
      {
        name: 'debugger',
        position: { line: 13, character: 9 } as Position,
        triggerCharacter: 'deb',
        completion: 'debugger',
      },
    ];

    tests.forEach(({ name, position, triggerCharacter, completion }) => {
      it(`should provide completion for ${name}`, async function () {
        const textDoc = await getDoc('completion/simple_tasks.yml');
        const context = workspaceManager.getContext(textDoc.uri);

        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter
        );

        filteredCompletion.forEach((item) => {
          item.item ? console.log(item.item.label) : console.log(item.label);
        });
        console.log('\n');

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          if (!filteredCompletion[0].item) {
            expect(filteredCompletion[0].label).be.equal(completion);
          } else {
            expect(filteredCompletion[0].item.label).to.be.equal(completion);
          }
        }
      });
    });
  });
  describe('Completion for module names (with different trigger scenarios)', () => {
    const tests = [
      {
        name: 'with name as first option always',
        position: { line: 6, character: 6 } as Position,
        triggerCharacter: '',
        completion: 'name',
      },
      {
        name: 'with `ping`',
        position: { line: 7, character: 8 } as Position,
        triggerCharacter: 'ping',
        completion: 'ansible.builtin.ping',
      },
      {
        name: 'with `debu`',
        position: { line: 7, character: 8 } as Position,
        triggerCharacter: 'debu',
        completion: 'ansible.builtin.debug',
      },
      {
        name: 'with `ansible.`',
        position: { line: 7, character: 8 } as Position,
        triggerCharacter: 'ansible.',
        completion: 'ansible.',
      },
      {
        name: 'with `ansible.builtin.`',
        position: { line: 7, character: 8 } as Position,
        triggerCharacter: 'ansible.builtin.',
        completion: 'ansible.builtin.',
      },
      {
        name: 'with `org_1.c`',
        position: { line: 16, character: 13 } as Position,
        triggerCharacter: 'org_1.c',
        completion: 'org_1.c',
      },
      {
        name: 'with `org_1.coll_4.`',
        position: { line: 16, character: 19 } as Position,
        triggerCharacter: 'org_1.coll_4.',
        completion: 'org_1.coll_4.',
      },
      {
        name: 'with `cli_`',
        position: { line: 7, character: 8 } as Position,
        triggerCharacter: 'cli_',
        completion: 'cli_',
      },
    ];

    tests.forEach(({ name, position, triggerCharacter, completion }) => {
      it(`should provide autocompletion ${name}`, async function () {
        const textDoc = await getDoc('completion/simple_tasks.yml');
        const context = workspaceManager.getContext(textDoc.uri);

        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter
        );

        filteredCompletion.forEach((item) => {
          item.item ? console.log(item.item.label) : console.log(item.label);
        });
        console.log('\n');

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          if (!filteredCompletion[0].item) {
            expect(filteredCompletion[0].label).to.contain(completion);
          } else {
            expect(filteredCompletion[0].item.label).to.contain(completion);
          }
        }
      });
    });
  });

  describe('Completion for module options and suboptions', () => {
    const tests = [
      {
        name: 'builtin module option (ansible.builtin.debug -> msg)',
        position: { line: 8, character: 9 } as Position,
        triggerCharacter: 'm',
        completion: 'msg',
      },
      {
        name: 'collection module option (org_1.coll_4.module_1 -> opt_1)',
        position: { line: 17, character: 8 } as Position,
        triggerCharacter: '',
        completion: 'opt_1',
      },
      {
        name: 'collection module sub option (org_1.coll_4.module_1 -> opt_1 -> sub_opt_1)',
        position: { line: 21, character: 12 } as Position,
        triggerCharacter: '1',
        completion: 'sub_opt_1',
      },
      {
        name: 'collection module sub option (org_1.coll_4.module_1 -> opt_1 -> sub_opt_2 -> sub_sub_opt_3 -> sub_sub_sub_opt_2)',
        position: { line: 26, character: 20 } as Position,
        triggerCharacter: '2',
        completion: 'sub_sub_sub_opt_2',
      },
      {
        name: 'only non repeating options',
        position: { line: 9, character: 9 } as Position,
        triggerCharacter: 'm',
        completion: '',
      },
      {
        name: 'only non repeating suboptions',
        position: { line: 29, character: 20 } as Position,
        triggerCharacter: '1',
        completion: '',
      },
    ];

    tests.forEach(({ name, position, triggerCharacter, completion }) => {
      it(`should provide completion for ${name}`, async function () {
        const textDoc = await getDoc('completion/simple_tasks.yml');
        const context = workspaceManager.getContext(textDoc.uri);

        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter
        );

        filteredCompletion.forEach((item) => {
          item.item ? console.log(item.item.label) : console.log(item.label);
        });
        console.log('\n');

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          if (!filteredCompletion[0].item) {
            expect(filteredCompletion[0].label).be.equal(completion);
          } else {
            expect(filteredCompletion[0].item.label).to.be.equal(completion);
          }
        }
      });
    });
  });
});
