import { expect } from 'chai';
import { promises as fs } from 'fs';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseAllDocuments } from 'yaml';
import { Node, Scalar, YAMLMap, YAMLSeq } from 'yaml/types';
import {
  AncestryBuilder,
  getDeclaredCollections,
  getPathAt,
  isBlock,
  isPlay,
  isTaskParameter,
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
  const parsedDocs = parseAllDocuments(textDoc.getText());
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
      const node = new AncestryBuilder(path).parent(YAMLSeq).get();
      expect(node).to.be.null;
    });

    it('canGetAncestor', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const node = new AncestryBuilder(path).parent().parent().get();
      expect(node).to.be.an.instanceOf(YAMLSeq);
    });

    it('canGetParentPath', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const subPath = new AncestryBuilder(path).parent().getPath();
      expect(subPath)
        .to.be.an.instanceOf(Array)
        .to.have.lengthOf((path?.length || 0) - 2);
    });

    it('canGetKey', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const key = new AncestryBuilder(path).parent(YAMLMap).getStringKey();
      expect(key).to.be.equal('name');
    });

    it('canGetKeyForValue', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 13);
      const key = new AncestryBuilder(path).parent(YAMLMap).getStringKey();
      expect(key).to.be.equal('name');
    });

    it('canGetKeyPath', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const subPath = new AncestryBuilder(path).parent(YAMLMap).getKeyPath();
      expect(subPath)
        .to.be.an.instanceOf(Array)
        .to.have.lengthOf(path?.length || 0);
      if (subPath)
        expect(subPath[subPath.length - 1])
          .to.be.an.instanceOf(Scalar)
          .to.have.property('value', 'name');
    });

    it('canGetAssertedParentOfKey', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 7);
      const node = new AncestryBuilder(path).parentOfKey().get();
      expect(node).to.be.an.instanceOf(YAMLMap);
      expect(node).to.have.nested.property('items[0].key.value', 'name');
    });

    it('canAssertParentOfKey', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 4, 13);
      const node = new AncestryBuilder(path).parentOfKey().get();
      expect(node).to.be.null;
    });

    it('canGetIndentationParent', async () => {
      const path = await getPathInFile('ancestryBuilder.yml', 7, 9);
      const node = new AncestryBuilder(path)
        .parent(YAMLMap)
        .parent(YAMLMap)
        .getStringKey();
      expect(node).to.be.equal('lineinfile');
    });

    it.skip('canGetIndentationParentAtEndOfMap', async () => {
      // skipped -> the YAML parser doesn't correctly interpret indentation in
      // otherwise empty lines; a workaround is implemented for completion
      // provider
      const path = await getPathInFile('ancestryBuilder.yml', 9, 9);
      const node = new AncestryBuilder(path)
        .parent(YAMLMap)
        .parent(YAMLMap)
        .getStringKey();
      expect(node).to.be.equal('lineinfile');
    });

    it.skip('canGetIndentationParentAtEOF', async () => {
      // skipped -> the YAML parser doesn't correctly interpret indentation in
      // otherwise empty lines; a workaround is implemented for completion
      // provider
      const path = await getPathInFile('ancestryBuilder.yml', 15, 9);
      const node = new AncestryBuilder(path)
        .parent(YAMLMap)
        .parent(YAMLMap)
        .getStringKey();
      expect(node).to.be.equal('lineinfile');
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

  describe('isTaskParameter', () => {
    it('canCorrectlyConfirmTaskParameter', async () => {
      const path = (await getPathInFile('isTaskParameter.yml', 1, 3)) as Node[];
      const test = isTaskParameter(path);
      expect(test).to.be.eq(true);
    });

    it('canCorrectlyNegateTaskParameter', async () => {
      const path = (await getPathInFile('isTaskParameter.yml', 4, 3)) as Node[];
      const test = isTaskParameter(path);
      expect(test).to.be.eq(false);
    });

    it('canCorrectlyNegateTaskParameterForValue', async () => {
      const path = (await getPathInFile('isTaskParameter.yml', 1, 9)) as Node[];
      const test = isTaskParameter(path);
      expect(test).to.be.eq(false);
    });

    it('canCorrectlyConfirmTaskParameterInPreTasks', async () => {
      const path = (await getPathInFile('isTaskParameter.yml', 8, 7)) as Node[];
      const test = isTaskParameter(path);
      expect(test).to.be.eq(true);
    });

    it('canCorrectlyConfirmTaskParameterInTasks', async () => {
      const path = (await getPathInFile(
        'isTaskParameter.yml',
        11,
        7
      )) as Node[];
      const test = isTaskParameter(path);
      expect(test).to.be.eq(true);
    });

    it('canCorrectlyConfirmTaskParameterInBlock', async () => {
      const path = (await getPathInFile(
        'isTaskParameter.yml',
        15,
        11
      )) as Node[];
      const test = isTaskParameter(path);
      expect(test).to.be.eq(true);
    });
  });

  describe('isPlay', () => {
    it('canCorrectlyConfirmPlay', async () => {
      const path = (await getPathInFile('isPlay.yml', 1, 3)) as Node[];
      const test = isPlay(path, 'file://test/isPlay.yml');
      expect(test).to.be.eq(true);
    });
    it('canCorrectlyConfirmPlayWithoutPath', async () => {
      const path = (await getPathInFile('isPlay.yml', 1, 3)) as Node[];
      const test = isPlay(path);
      expect(test).to.be.eq(true);
    });

    it('canCorrectlyConfirmPlayInStrangePath', async () => {
      const path = (await getPathInFile('isPlay.yml', 1, 3)) as Node[];
      const test = isPlay(path, 'file:///roles/test/tasks/isPlay.yml');
      expect(test).to.be.eq(true);
    });

    it('canCorrectlyNegatePlayInRolePathWithoutPlayKeywords', async () => {
      const path = (await getPathInFile('isPlay.yml', 7, 3)) as Node[];
      const test = isPlay(path, 'file:///roles/test/tasks/isPlay.yml');
      expect(test).to.be.eq(false);
    });

    it('isUndecisiveWithoutPlayKeywords', async () => {
      const path = (await getPathInFile('isPlay.yml', 7, 3)) as Node[];
      const test = isPlay(path, 'file://test/isPlay.yml');
      expect(test).to.be.eq(undefined);
    });

    it('isUndecisiveWithoutPlayKeywordsWithoutPath', async () => {
      const path = (await getPathInFile('isPlay.yml', 7, 3)) as Node[];
      const test = isPlay(path);
      expect(test).to.be.eq(undefined);
    });

    it('canCorrectlyNegatePlayForNonRootSequence', async () => {
      const path = (await getPathInFile('isPlay.yml', 14, 7)) as Node[];
      const test = isPlay(path, 'file://test/isPlay.yml');
      expect(test).to.be.eq(false);
    });

    it('canCorrectlyNegatePlayForNonRootSequenceWithoutPath', async () => {
      const path = (await getPathInFile('isPlay.yml', 14, 7)) as Node[];
      const test = isPlay(path);
      expect(test).to.be.eq(false);
    });

    it('canCorrectlyNegatePlayForValue', async () => {
      const path = (await getPathInFile('isPlay.yml', 1, 9)) as Node[];
      const test = isPlay(path);
      expect(test).to.be.eq(false);
    });
  });

  describe('isBlock', () => {
    it('canCorrectlyConfirmBlock', async () => {
      const path = (await getPathInFile('isBlock.yml', 2, 3)) as Node[];
      const test = isBlock(path);
      expect(test).to.be.eq(true);
    });
    it('canCorrectlyNegateBlock', async () => {
      const path = (await getPathInFile('isBlock.yml', 5, 3)) as Node[];
      const test = isBlock(path);
      expect(test).to.be.eq(false);
    });
    it('canCorrectlyNegateBlockOnValue', async () => {
      const path = (await getPathInFile('isBlock.yml', 2, 11)) as Node[];
      const test = isBlock(path);
      expect(test).to.be.eq(false);
    });
  });
});
