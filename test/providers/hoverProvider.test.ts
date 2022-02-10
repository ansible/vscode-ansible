import { expect } from 'chai';
import {
  createTestWorkspaceManager,
  getDoc,
  setFixtureAnsibleCollectionPathEnv,
} from '../helper';
import { doHover } from '../../src/providers/hoverProvider';
import { Position } from 'vscode-languageserver';

setFixtureAnsibleCollectionPathEnv();

describe('doHover()', () => {
  const workspaceManager = createTestWorkspaceManager();

  describe('Play keywords hover', () => {
    const tests = [
      {
        word: 'name',
        position: { line: 0, character: 4 } as Position,
        doc: 'Identifier. Can be used for documentation, or in tasks/handlers.',
      },
      {
        word: 'host',
        position: { line: 1, character: 4 } as Position,
        doc: 'A list of groups, hosts or host pattern that translates into a list of hosts that are the play’s target.',
      },
      {
        word: 'tasks',
        position: { line: 3, character: 4 } as Position,
        doc: 'Main list of tasks to execute in the play, they run after roles and before post_tasks.',
      },
    ];

    tests.forEach(({ word, position, doc }) => {
      it(`should provide hovering for '${word}'`, async function () {
        const textDoc = await getDoc('hover/tasks.yml');
        const context = workspaceManager.getContext(textDoc.uri);

        const actualHover = await doHover(
          textDoc,
          position,
          await context.docsLibrary
        );
        expect(actualHover.contents['value']).includes(doc);
      });
    });
  });

  describe('Task keywords hover', () => {
    const tests = [
      {
        word: 'register',
        position: { line: 6, character: 8 } as Position,
        doc: 'Name of variable that will contain task status and module return data.',
      },
    ];

    tests.forEach(({ word, position, doc }) => {
      it(`should provide hovering for '${word}'`, async function () {
        const textDoc = await getDoc('hover/tasks.yml');
        const context = workspaceManager.getContext(textDoc.uri);

        const actualHover = await doHover(
          textDoc,
          position,
          await context.docsLibrary
        );
        expect(actualHover.contents['value']).includes(doc);
      });
    });
  });

  describe('Block keywords hover', () => {
    const tests = [
      {
        word: 'become',
        position: { line: 11, character: 8 } as Position,
        doc: 'Boolean that controls if privilege escalation is used or not on Task execution. Implemented by the become plugin.',
      },
    ];

    tests.forEach(({ word, position, doc }) => {
      it(`should provide hovering for '${word}'`, async function () {
        const textDoc = await getDoc('hover/tasks.yml');
        const context = workspaceManager.getContext(textDoc.uri);

        const actualHover = await doHover(
          textDoc,
          position,
          await context.docsLibrary
        );
        expect(actualHover.contents['value']).includes(doc);
      });
    });
  });

  describe('Role keywords hover', () => {
    const tests = [
      {
        word: 'tags',
        position: { line: 6, character: 8 } as Position,
        doc: 'Tags applied to the task or included tasks, this allows selecting subsets of tasks from the command line.',
      },
    ];

    tests.forEach(({ word, position, doc }) => {
      it(`should provide hovering for '${word}'`, async function () {
        const textDoc = await getDoc('hover/roles.yml');
        const context = workspaceManager.getContext(textDoc.uri);

        const actualHover = await doHover(
          textDoc,
          position,
          await context.docsLibrary
        );
        expect(actualHover.contents['value']).includes(doc);
      });
    });
  });

  describe('Module name and options hover', () => {
    const tests = [
      {
        word: 'ansible.builtin.debug',
        position: { line: 4, character: 8 } as Position,
        doc: 'Print statements during execution',
      },
      {
        word: 'ansible.builtin.debug -> msg',
        position: { line: 5, character: 10 } as Position,
        doc: 'The customized message that is printed. If omitted, prints a generic message.',
      },
    ];

    tests.forEach(({ word, position, doc }) => {
      it(`should provide hovering for '${word}'`, async function () {
        const textDoc = await getDoc('hover/tasks.yml');
        const context = workspaceManager.getContext(textDoc.uri);

        const actualHover = await doHover(
          textDoc,
          position,
          await context.docsLibrary
        );
        expect(actualHover.contents['value']).includes(doc);
      });
    });
  });

  describe('No hover', () => {
    it('should not provide hovering for values', async function () {
      const textDoc = await getDoc('hover/tasks.yml');
      const context = workspaceManager.getContext(textDoc.uri);

      const actualHover = await doHover(
        textDoc,
        { line: 13, character: 24 } as Position,
        await context.docsLibrary
      );
      expect(actualHover).to.be.null;
    });

    it('should not provide hovering for improper module name and options', async function () {
      const textDoc = await getDoc('hover/tasks.yml');
      const context = workspaceManager.getContext(textDoc.uri);

      const actualHover = await doHover(
        textDoc,
        { line: 13, character: 8 } as Position,
        await context.docsLibrary
      );
      expect(actualHover).to.be.null;
    });

    it('should not provide hovering for improper module option', async function () {
      const textDoc = await getDoc('hover/tasks.yml');
      const context = workspaceManager.getContext(textDoc.uri);

      const actualHover = await doHover(
        textDoc,
        { line: 14, character: 10 } as Position,
        await context.docsLibrary
      );
      expect(actualHover).to.be.null;
    });
  });
});
