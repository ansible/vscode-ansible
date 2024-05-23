// codespell:ignore isPlay
import { expect } from "chai";
import { Position } from "vscode-languageserver";
import { Node, Scalar, YAMLMap, YAMLSeq } from "yaml";
import {
  AncestryBuilder,
  getDeclaredCollections,
  getPathAt,
  isBlockParam,
  isCursorInsideJinjaBrackets,
  isPlayParam,
  isRoleParam,
  isTaskParam,
  parseAllDocuments,
} from "../../src/utils/yaml";
import { getDoc, isWindows } from "../helper";

function getPathInFile(yamlFile: string, line: number, character: number) {
  const textDoc = getDoc(`yaml/${yamlFile}`);
  const parsedDocs = parseAllDocuments(textDoc.getText());
  return getPathAt(
    textDoc,
    { line: line - 1, character: character - 1 },
    parsedDocs,
  );
}

describe("yaml", () => {
  beforeEach(function (this: Mocha.Context) {
    const brokenTests = new Map([
      // ['<testName>', '<url-of-tracking-issue>'],
    ]);
    const reason = brokenTests.get(this.currentTest?.title);
    if (isWindows() && reason && this.currentTest) {
      const msg = `Marked ${this.currentTest.title} as pending due to ${reason}`;
      if (process.env.GITHUB_ACTIONS) {
        console.log(`::warning file=${this.currentTest.file}:: ${msg}`);
      } else {
        console.log(`🚩 ${msg}`);
      }
      this.currentTest.pending = true;
    }
  });

  describe("ancestryBuilder", () => {
    it("canGetParent", async () => {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const node = new AncestryBuilder(path).parent().get();
      expect(node).to.be.an.instanceOf(YAMLMap);
    });

    it("canGetAssertedParent", async () => {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const node = new AncestryBuilder(path).parent(YAMLMap).get();
      expect(node).to.be.an.instanceOf(YAMLMap);
    });

    it("canAssertParent", async () => {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const node = new AncestryBuilder(path).parent(YAMLSeq).get();
      expect(node).to.be.null;
    });

    it("canGetAncestor", async () => {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const node = new AncestryBuilder(path).parent().parent().get();
      expect(node).to.be.an.instanceOf(YAMLSeq);
    });

    it("canGetParentPath", async () => {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const subPath = new AncestryBuilder(path).parent().getPath();
      expect(subPath)
        .to.be.an.instanceOf(Array)
        .to.have.lengthOf((path?.length || 0) - 2);
    });

    it("canGetKey", async () => {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const key = new AncestryBuilder(path).parent(YAMLMap).getStringKey();
      expect(key).to.be.equal("name");
    });

    it("canGetKeyForValue", async () => {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 13);
      const key = new AncestryBuilder(path).parent(YAMLMap).getStringKey();
      expect(key).to.be.equal("name");
    });

    it("canGetKeyPath", async () => {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const subPath = new AncestryBuilder(path).parent(YAMLMap).getKeyPath();
      expect(subPath)
        .to.be.an.instanceOf(Array)
        .to.have.lengthOf(path?.length || 0);
      if (subPath)
        expect(subPath[subPath.length - 1])
          .to.be.an.instanceOf(Scalar)
          .to.have.property("value", "name");
    });

    it("canGetAssertedParentOfKey", async () => {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const node = new AncestryBuilder(path).parentOfKey().get();
      expect(node).to.be.an.instanceOf(YAMLMap);
      expect(node).to.have.nested.property("items[0].key.value", "name");
    });

    it("canAssertParentOfKey", async () => {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 13);
      const node = new AncestryBuilder(path).parentOfKey().get();
      expect(node).to.be.null;
    });

    it("canGetIndentationParent", async () => {
      const path = await getPathInFile("ancestryBuilder.yml", 7, 9);
      const node = new AncestryBuilder(path)
        .parent(YAMLMap)
        .parent(YAMLMap)
        .getStringKey();
      expect(node).to.be.equal("lineinfile");
    });

    it.skip("canGetIndentationParentAtEndOfMap", async () => {
      // skipped -> the YAML parser doesn't correctly interpret indentation in
      // otherwise empty lines; a workaround is implemented for completion
      // provider
      const path = await getPathInFile("ancestryBuilder.yml", 9, 9);
      if (path) {
        const node = new AncestryBuilder(path)
          .parent(YAMLMap)
          .parent(YAMLMap)
          .getStringKey();
        expect(node).to.be.equal("lineinfile");
      }
    });

    it.skip("canGetIndentationParentAtEOF", async () => {
      // skipped -> the YAML parser doesn't correctly interpret indentation in
      // otherwise empty lines; a workaround is implemented for completion
      // provider
      const path = await getPathInFile("ancestryBuilder.yml", 15, 9);
      const node = new AncestryBuilder(path)
        .parent(YAMLMap)
        .parent(YAMLMap)
        .getStringKey();
      expect(node).to.be.equal("lineinfile");
    });
  });

  describe("getDeclaredCollections", () => {
    it("canGetCollections", async () => {
      const path = await getPathInFile("getDeclaredCollections.yml", 13, 7);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([
        "mynamespace.mycollection",
        "mynamespace2.mycollection2",
      ]);
    });
    it("canGetCollectionsFromPreTasks", async () => {
      const path = await getPathInFile("getDeclaredCollections.yml", 9, 7);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([
        "mynamespace.mycollection",
        "mynamespace2.mycollection2",
      ]);
    });
    it("canGetCollectionsFromBlock", async () => {
      const path = await getPathInFile("getDeclaredCollections.yml", 12, 11);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([
        "mynamespace.mycollection",
        "mynamespace2.mycollection2",
      ]);
    });
    it("canGetCollectionsFromNestedBlock", async () => {
      const path = await getPathInFile("getDeclaredCollections.yml", 23, 15);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([
        "mynamespace.mycollection",
        "mynamespace2.mycollection2",
      ]);
    });
    it("canGetCollectionsFromRescue", async () => {
      const path = await getPathInFile("getDeclaredCollections.yml", 27, 11);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([
        "mynamespace.mycollection",
        "mynamespace2.mycollection2",
      ]);
    });
    it("canGetCollectionsFromAlways", async () => {
      const path = await getPathInFile("getDeclaredCollections.yml", 31, 11);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([
        "mynamespace.mycollection",
        "mynamespace2.mycollection2",
      ]);
    });
    it("canWorkWithoutCollections", async () => {
      const path = await getPathInFile("getDeclaredCollections.yml", 38, 7);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([]);
    });
    it("canWorkWithEmptyCollections", async () => {
      const path = await getPathInFile("getDeclaredCollections.yml", 46, 7);
      const collections = getDeclaredCollections(path);
      expect(collections).to.have.members([]);
    });
  });

  describe("isTaskParam", () => {
    it("canCorrectlyConfirmTaskParam", async () => {
      const path = (await getPathInFile(
        "isTaskParamInTaskFile.yml",
        2,
        3,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(true);
    });

    it("canCorrectlyNegateTaskParam", async () => {
      const path = (await getPathInFile(
        "isTaskParamInvalid.yml",
        1,
        1,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegateTaskParamForValue", async () => {
      const path = (await getPathInFile(
        "isTaskParamInTaskFile.yml",
        2,
        9,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegateTaskParamForPlay", async () => {
      const path = (await getPathInFile(
        "isTaskParamInPlaybook.yml",
        4,
        3,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegateTaskParamForBlock", async () => {
      const path = (await getPathInFile(
        "isTaskParamInPlaybook.yml",
        14,
        7,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegateTaskParamForRole", async () => {
      const path = (await getPathInFile(
        "isTaskParamInPlaybook.yml",
        17,
        7,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyConfirmTaskParamInPreTasks", async () => {
      const path = (await getPathInFile(
        "isTaskParamInPlaybook.yml",
        6,
        7,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(true);
    });

    it("canCorrectlyConfirmTaskParamInTasks", async () => {
      const path = (await getPathInFile(
        "isTaskParamInPlaybook.yml",
        9,
        7,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(true);
    });

    it("canCorrectlyConfirmTaskParamInBlock", async () => {
      const path = (await getPathInFile(
        "isTaskParamInPlaybook.yml",
        13,
        11,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(true);
    });
  });

  describe("isPlayParam", () => {
    it("canCorrectlyConfirmPlayParam", async () => {
      const path = (await getPathInFile("isPlayParam.yml", 1, 3)) as Node[];
      const test = isPlayParam(path, "file://test/isPlay.yml");
      expect(test).to.be.eq(true);
    });
    it("canCorrectlyConfirmPlayParamWithoutPath", async () => {
      const path = (await getPathInFile("isPlayParam.yml", 1, 3)) as Node[];
      const test = isPlayParam(path);
      expect(test).to.be.eq(true);
    });

    it("canCorrectlyConfirmPlayParamInStrangePath", async () => {
      const path = (await getPathInFile("isPlayParam.yml", 1, 3)) as Node[];
      const test = isPlayParam(path, "file:///roles/test/tasks/isPlay.yml");
      expect(test).to.be.eq(true);
    });

    it("canCorrectlyNegatePlayParamInRolePathWithoutPlayKeywords", async () => {
      const path = (await getPathInFile("isPlayParam.yml", 7, 3)) as Node[];
      const test = isPlayParam(path, "file:///roles/test/tasks/isPlay.yml");
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegatePlayParamForNonRootSequence", async () => {
      const path = (await getPathInFile("isPlayParam.yml", 14, 7)) as Node[];
      const test = isPlayParam(path, "file://test/isPlay.yml");
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegatePlayParamForNonRootSequenceWithoutPath", async () => {
      const path = (await getPathInFile("isPlayParam.yml", 14, 7)) as Node[];
      const test = isPlayParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegatePlayParamForValue", async () => {
      const path = (await getPathInFile("isPlayParam.yml", 1, 9)) as Node[];
      const test = isPlayParam(path);
      expect(test).to.be.eq(false);
    });
  });

  describe("isBlockParam", () => {
    it("canCorrectlyConfirmBlockParam", async () => {
      const path = (await getPathInFile("isBlockParam.yml", 2, 3)) as Node[];
      const test = isBlockParam(path);
      expect(test).to.be.eq(true);
    });

    it("canCorrectlyNegateBlockParam", async () => {
      const path = (await getPathInFile("isBlockParam.yml", 5, 3)) as Node[];
      const test = isBlockParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegateBlockParamOnValue", async () => {
      const path = (await getPathInFile("isBlockParam.yml", 2, 11)) as Node[];
      const test = isBlockParam(path);
      expect(test).to.be.eq(false);
    });
  });

  describe("isRoleParam", () => {
    it("canCorrectlyConfirmRoleParam", async () => {
      const path = (await getPathInFile("isRoleParam.yml", 5, 7)) as Node[];
      const test = isRoleParam(path);
      expect(test).to.be.eq(true);
    });

    it("canCorrectlyNegateRoleParam", async () => {
      const path = (await getPathInFile("isRoleParam.yml", 4, 3)) as Node[];
      const test = isRoleParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegateRoleParamOnValue", async () => {
      const path = (await getPathInFile("isRoleParam.yml", 5, 13)) as Node[];
      const test = isRoleParam(path);
      expect(test).to.be.eq(false);
    });
  });

  describe("isCursorInsideJinjaBrackets", () => {
    const file = "isCursorInsideJinjaBrackets.yml";
    const document = getDoc(`yaml/${file}`);
    it("can confirm cursor within normal jinja bracket", async () => {
      const line = 5;
      const character = 26;
      const position = Position.create(line - 1, character - 1);
      const path = getPathInFile(file, line, character);
      if (path) {
        const test = isCursorInsideJinjaBrackets(document, position, path);
        expect(test).to.be.eq(true);
      } else {
        expect(false);
      }
    });

    it("can confirm cursor within jinja bracket in correct syntax", async () => {
      const line = 7;
      const character = 20;
      const position = Position.create(line - 1, character - 1);
      const path = getPathInFile(file, line, character);
      if (path) {
        const test = isCursorInsideJinjaBrackets(document, position, path);
        expect(test).to.be.eq(true);
      } else {
        expect(false);
      }
    });

    it("can confirm cursor within jinja bracket in case of multiple bracket pairs", async () => {
      const line = 9;
      const character = 48;
      const position = Position.create(line - 1, character - 1);
      const path = getPathInFile(file, line, character);
      if (path) {
        const test = isCursorInsideJinjaBrackets(document, position, path);
        expect(test).to.be.eq(true);
      } else {
        expect(false);
      }
    });

    it("can confirm cursor within jinja bracket even if text already present inside it", async () => {
      const line = 9;
      const character = 36;
      const position = Position.create(line - 1, character - 1);
      const path = getPathInFile(file, line, character);
      if (path) {
        const test = isCursorInsideJinjaBrackets(document, position, path);
        expect(test).to.be.eq(true);
      } else {
        expect(false);
      }
    });

    it("can negate cursor outside jinja bracket", async () => {
      const line = 9;
      const character = 21;
      const position = Position.create(line - 1, character - 1);
      const path = getPathInFile(file, line, character) as Node[];
      const test = isCursorInsideJinjaBrackets(document, position, path);

      expect(test).to.be.eq(false);
    });

    it("can negate cursor within jinja bracket in case of invalid yaml syntax", async () => {
      const line = 11;
      const character = 25;
      const position = Position.create(line - 1, character - 1);
      const path = getPathInFile(file, line, character) as Node[];
      const test = isCursorInsideJinjaBrackets(document, position, path);

      expect(test).to.be.eq(false);
    });
  });
});
