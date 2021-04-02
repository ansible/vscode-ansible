import { expect } from 'chai';
import { promises as fs } from 'fs';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseAllDocuments } from 'yaml';
import { Scalar, YAMLMap, YAMLSeq } from 'yaml/types';
import {
  AncestryBuilder,
  getDeclaredCollections,
  getPathAt,
} from '../../utils/yaml';

async function getYamlDoc(yamlFile: string) {
  const yaml = await fs.readFile(
    path.resolve('server', 'src', 'test', 'data', 'utils', 'yaml', yamlFile),
    {
      encoding: 'utf8',
    }
  );
  return TextDocument.create('uri', 'ansible', 1, yaml);
}

async function getPathInFile(
  yamlFile: string,
  line: number,
  character: number
) {
  const textDoc = await getYamlDoc(yamlFile);
  const parsedDocs = parseAllDocuments(`${textDoc.getText()}\n`); // the newline is crucial for completion provider
  return getPathAt(
    textDoc,
    { line: line - 1, character: character - 1 },
    parsedDocs
  );
}

describe('yaml', () => {
  describe('ancestryBuilder', () => {
    it('canGetParent', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const node = new AncestryBuilder(path).parent().get();
      expect(node).to.be.an.instanceOf(YAMLMap);
    });

    it('canGetAssertedParent', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const node = new AncestryBuilder(path).parent(YAMLMap).get();
      expect(node).to.be.an.instanceOf(YAMLMap);
    });

    it('canAssertParent', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const node = new AncestryBuilder(path).parent().parent(YAMLMap).get();
      expect(node).to.be.null;
    });

    it('canGetAncestor', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const node = new AncestryBuilder(path).parent().parent().get();
      expect(node).to.be.an.instanceOf(YAMLSeq);
    });

    it('canGetKey', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const node = new AncestryBuilder(path).parentKey().get();
      expect(node)
        .to.be.an.instanceOf(Scalar)
        .to.have.property('value', 'name');
    });

    it('canGetKeyPath', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const subPath = new AncestryBuilder(path).parentKey().getPath();
      expect(subPath)
        .to.be.an.instanceOf(Array)
        .to.have.lengthOf(path?.length || 0);
      if (subPath)
        expect(subPath[subPath.length - 1])
          .to.be.an.instanceOf(Scalar)
          .to.have.property('value', 'name');
    });

    it('canGetAssertedKey', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const node = new AncestryBuilder(path).parentKey('name').get();
      expect(node)
        .to.be.an.instanceOf(Scalar)
        .to.have.property('value', 'name');
    });

    it('canGetAssertedRegexKey', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const node = new AncestryBuilder(path).parentKey(/^(name|other)$/).get();
      expect(node)
        .to.be.an.instanceOf(Scalar)
        .to.have.property('value', 'name');
    });

    it('canAssertKey', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const node = new AncestryBuilder(path).parentKey('other').get();
      expect(node).to.be.null;
    });

    it('canAssertKeyPath', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const subPath = new AncestryBuilder(path).parentKey('other').getPath();
      expect(subPath).to.be.null;
    });

    it('canGetAssertedAncestorKey', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const node = new AncestryBuilder(path)
        .parent(YAMLMap)
        .parent(YAMLSeq)
        .parentKey('block')
        .get();
      expect(node)
        .to.be.an.instanceOf(Scalar)
        .to.have.property('value', 'block');
    });

    it('canGetIndentationParent', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 7, 9);
      const node = new AncestryBuilder(path)
        .parent()
        .parentKey('lineinfile')
        .get();
      expect(node)
        .to.be.an.instanceOf(Scalar)
        .to.have.property('value', 'lineinfile');
    });

    it('canGetIndentationParentAtEndOfMap', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 9, 9);
      const node = new AncestryBuilder(path)
        .parent()
        .parentKey('lineinfile')
        .get();
      expect(node)
        .to.be.an.instanceOf(Scalar)
        .to.have.property('value', 'lineinfile');
    });

    it('canGetIndentationParentAtEOF', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 15, 9);
      const node = new AncestryBuilder(path)
        .parent()
        .parentKey('lineinfile')
        .get();
      expect(node)
        .to.be.an.instanceOf(Scalar)
        .to.have.property('value', 'lineinfile');
    });
  });

  describe('getDeclaredCollections', () => {
    it('canGetCollections', async () => {
      const path = await getPathInFile('getDeclaredCollections.yml', 13, 7);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([
        'mynamespace.mycollection',
        'mynamespace2.mycollection2',
      ]);
    });
    it('canGetCollectionsFromPreTasks', async () => {
      const path = await getPathInFile('getDeclaredCollections.yml', 9, 7);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([
        'mynamespace.mycollection',
        'mynamespace2.mycollection2',
      ]);
    });
    it('canGetCollectionsFromBlock', async () => {
      const path = await getPathInFile('getDeclaredCollections.yml', 12, 11);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([
        'mynamespace.mycollection',
        'mynamespace2.mycollection2',
      ]);
    });
    it('canGetCollectionsFromNestedBlock', async () => {
      const path = await getPathInFile('getDeclaredCollections.yml', 23, 15);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([
        'mynamespace.mycollection',
        'mynamespace2.mycollection2',
      ]);
    });
    it('canGetCollectionsFromRescue', async () => {
      const path = await getPathInFile('getDeclaredCollections.yml', 27, 11);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([
        'mynamespace.mycollection',
        'mynamespace2.mycollection2',
      ]);
    });
    it('canGetCollectionsFromAlways', async () => {
      const path = await getPathInFile('getDeclaredCollections.yml', 31, 11);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([
        'mynamespace.mycollection',
        'mynamespace2.mycollection2',
      ]);
    });
    it('canWorkWithoutCollections', async () => {
      const path = await getPathInFile('getDeclaredCollections.yml', 38, 7);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([]);
    });
    it('canWorkWithEmptyCollections', async () => {
      const path = await getPathInFile('getDeclaredCollections.yml', 46, 7);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([]);
    });
  });
});
