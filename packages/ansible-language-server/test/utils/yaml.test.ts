// codespell:ignore isPlay
import { expect, beforeEach } from "vitest";
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
} from "../../src/utils/yaml.js";
import { getDoc, isWindows } from "../helper.js";

function getPathInFile(yamlFile: string, line: number, character: number) {
  const textDoc = getDoc(`yaml/${yamlFile}`);
  const parsedDocs = parseAllDocuments(textDoc.getText());
  return getPathAt(
    textDoc,
    { line: line - 1, character: character - 1 },
    parsedDocs,
  );
}

describe("yaml", function () {
  beforeEach((context) => {
    const brokenTests = new Map([
      // ['<testName>', '<url-of-tracking-issue>'],
    ]);
    const reason = brokenTests.get(context.task?.name);
    if (isWindows() && reason && context.task) {
      const msg = `Marked ${context.task.name} as pending due to ${reason}`;
      if (process.env.GITHUB_ACTIONS) {
        console.log(`::warning file=${context.task.file}:: ${msg}`);
      } else {
        console.log(`🚩 ${msg}`);
      }
      context.skip();
    }
  });

  describe("ancestryBuilder", function () {
    it("canGetParent", async function () {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const node = new AncestryBuilder(path).parent().get();
      expect(node).toBeInstanceOf(YAMLMap);
    });

    it("canGetAssertedParent", async function () {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const node = new AncestryBuilder(path).parent(YAMLMap).get();
      expect(node).toBeInstanceOf(YAMLMap);
    });

    it("canAssertParent", async function () {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const node = new AncestryBuilder(path).parent(YAMLSeq).get();
      expect(node).toBeNull();
    });

    it("canGetAncestor", async function () {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const node = new AncestryBuilder(path).parent().parent().get();
      expect(node).toBeInstanceOf(YAMLSeq);
    });

    it("canGetParentPath", async function () {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const subPath = new AncestryBuilder(path).parent().getPath();
      expect(subPath).toBeInstanceOf(Array);
      expect(subPath).toHaveLength((path?.length || 0) - 2);
    });

    it("canGetKey", async function () {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const key = new AncestryBuilder(path).parent(YAMLMap).getStringKey();
      expect(key).toBe("name");
    });

    it("canGetKeyForValue", async function () {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 13);
      const key = new AncestryBuilder(path).parent(YAMLMap).getStringKey();
      expect(key).toBe("name");
    });

    it("canGetKeyPath", async function () {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const subPath = new AncestryBuilder(path).parent(YAMLMap).getKeyPath();
      expect(subPath).toBeInstanceOf(Array);
      expect(subPath).toHaveLength(path?.length || 0);
      if (subPath && subPath.length > 0) {
        expect(subPath[subPath.length - 1]).toBeInstanceOf(Scalar);
        expect(subPath[subPath.length - 1]).toHaveProperty("value", "name");
      }
    });

    it("canGetAssertedParentOfKey", async function () {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 7);
      const node = new AncestryBuilder(path).parentOfKey().get();
      expect(node).toBeInstanceOf(YAMLMap);
      if (node) {
        const yamlMap = node;
        expect(yamlMap).toHaveProperty("items");
        const firstItem = yamlMap.items?.[0];
        if (firstItem && "key" in firstItem) {
          const key = firstItem.key as Scalar;
          expect(key.value).toBe("name");
        }
      }
    });

    it("canAssertParentOfKey", async function () {
      const path = await getPathInFile("ancestryBuilder.yml", 4, 13);
      const node = new AncestryBuilder(path).parentOfKey().get();
      expect(node).toBeNull();
    });

    it("canGetIndentationParent", async function () {
      const path = await getPathInFile("ancestryBuilder.yml", 7, 9);
      const node = new AncestryBuilder(path)
        .parent(YAMLMap)
        .parent(YAMLMap)
        .getStringKey();
      expect(node).toBe("lineinfile");
    });

    it.skip("canGetIndentationParentAtEndOfMap", async function () {
      // skipped -> the YAML parser doesn't correctly interpret indentation in
      // otherwise empty lines; a workaround is implemented for completion
      // provider
      const path = await getPathInFile("ancestryBuilder.yml", 9, 9);
      if (path) {
        const node = new AncestryBuilder(path)
          .parent(YAMLMap)
          .parent(YAMLMap)
          .getStringKey();
        expect(node).toBe("lineinfile");
      }
    });

    it.skip("canGetIndentationParentAtEOF", async function () {
      // skipped -> the YAML parser doesn't correctly interpret indentation in
      // otherwise empty lines; a workaround is implemented for completion
      // provider
      const path = await getPathInFile("ancestryBuilder.yml", 15, 9);
      const node = new AncestryBuilder(path)
        .parent(YAMLMap)
        .parent(YAMLMap)
        .getStringKey();
      expect(node).toBe("lineinfile");
    });
  });

  describe("getDeclaredCollections", function () {
    it("canGetCollections", async function () {
      const path = await getPathInFile("getDeclaredCollections.yml", 13, 7);
      const collections = getDeclaredCollections(path);
      expect(collections).toEqual(
        expect.arrayContaining([
          "mynamespace.mycollection",
          "mynamespace2.mycollection2",
        ]),
      );
    });

    it("canGetCollectionsFromPreTasks", async function () {
      const path = await getPathInFile("getDeclaredCollections.yml", 9, 7);
      const collections = getDeclaredCollections(path);
      expect(collections).toEqual(
        expect.arrayContaining([
          "mynamespace.mycollection",
          "mynamespace2.mycollection2",
        ]),
      );
    });

    it("canGetCollectionsFromBlock", async function () {
      const path = await getPathInFile("getDeclaredCollections.yml", 12, 11);
      const collections = getDeclaredCollections(path);
      expect(collections).toEqual(
        expect.arrayContaining([
          "mynamespace.mycollection",
          "mynamespace2.mycollection2",
        ]),
      );
    });

    it("canGetCollectionsFromNestedBlock", async function () {
      const path = await getPathInFile("getDeclaredCollections.yml", 23, 15);
      const collections = getDeclaredCollections(path);
      expect(collections).toEqual(
        expect.arrayContaining([
          "mynamespace.mycollection",
          "mynamespace2.mycollection2",
        ]),
      );
    });

    it("canGetCollectionsFromRescue", async function () {
      const path = await getPathInFile("getDeclaredCollections.yml", 27, 11);
      const collections = getDeclaredCollections(path);
      expect(collections).toEqual(
        expect.arrayContaining([
          "mynamespace.mycollection",
          "mynamespace2.mycollection2",
        ]),
      );
    });

    it("canGetCollectionsFromAlways", async function () {
      const path = await getPathInFile("getDeclaredCollections.yml", 31, 11);
      const collections = getDeclaredCollections(path);
      expect(collections).toEqual(
        expect.arrayContaining([
          "mynamespace.mycollection",
          "mynamespace2.mycollection2",
        ]),
      );
    });

    it("canWorkWithoutCollections", async function () {
      const path = await getPathInFile("getDeclaredCollections.yml", 38, 7);
      const collections = getDeclaredCollections(path);
      expect(collections).toEqual(expect.arrayContaining([]));
    });

    it("canWorkWithEmptyCollections", async function () {
      const path = await getPathInFile("getDeclaredCollections.yml", 46, 7);
      const collections = getDeclaredCollections(path);
      expect(collections).toEqual(expect.arrayContaining([]));
    });
  });

  describe("isTaskParam", function () {
    it("canCorrectlyConfirmTaskParam", async function () {
      const path = (await getPathInFile(
        "isTaskParamInTaskFile.yml",
        2,
        3,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(true);
    });

    it("canCorrectlyNegateTaskParam", async function () {
      const path = (await getPathInFile(
        "isTaskParamInvalid.yml",
        1,
        1,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegateTaskParamForValue", async function () {
      const path = (await getPathInFile(
        "isTaskParamInTaskFile.yml",
        2,
        9,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegateTaskParamForPlay", async function () {
      const path = (await getPathInFile(
        "isTaskParamInPlaybook.yml",
        4,
        3,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegateTaskParamForBlock", async function () {
      const path = (await getPathInFile(
        "isTaskParamInPlaybook.yml",
        14,
        7,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegateTaskParamForRole", async function () {
      const path = (await getPathInFile(
        "isTaskParamInPlaybook.yml",
        17,
        7,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyConfirmTaskParamInPreTasks", async function () {
      const path = (await getPathInFile(
        "isTaskParamInPlaybook.yml",
        6,
        7,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(true);
    });

    it("canCorrectlyConfirmTaskParamInTasks", async function () {
      const path = (await getPathInFile(
        "isTaskParamInPlaybook.yml",
        9,
        7,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(true);
    });

    it("canCorrectlyConfirmTaskParamInBlock", async function () {
      const path = (await getPathInFile(
        "isTaskParamInPlaybook.yml",
        13,
        11,
      )) as Node[];
      const test = isTaskParam(path);
      expect(test).to.be.eq(true);
    });
  });

  describe("isPlayParam", function () {
    it("canCorrectlyConfirmPlayParam", async function () {
      const path = (await getPathInFile("isPlayParam.yml", 1, 3)) as Node[];
      const test = isPlayParam(path, "file://test/isPlay.yml");
      expect(test).to.be.eq(true);
    });

    it("canCorrectlyConfirmPlayParamWithoutPath", async function () {
      const path = (await getPathInFile("isPlayParam.yml", 1, 3)) as Node[];
      const test = isPlayParam(path);
      expect(test).to.be.eq(true);
    });

    it("canCorrectlyConfirmPlayParamInStrangePath", async function () {
      const path = (await getPathInFile("isPlayParam.yml", 1, 3)) as Node[];
      const test = isPlayParam(path, "file:///roles/test/tasks/isPlay.yml");
      expect(test).to.be.eq(true);
    });

    it("canCorrectlyNegatePlayParamInRolePathWithoutPlayKeywords", async function () {
      const path = (await getPathInFile("isPlayParam.yml", 7, 3)) as Node[];
      const test = isPlayParam(path, "file:///roles/test/tasks/isPlay.yml");
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegatePlayParamForNonRootSequence", async function () {
      const path = (await getPathInFile("isPlayParam.yml", 14, 7)) as Node[];
      const test = isPlayParam(path, "file://test/isPlay.yml");
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegatePlayParamForNonRootSequenceWithoutPath", async function () {
      const path = (await getPathInFile("isPlayParam.yml", 14, 7)) as Node[];
      const test = isPlayParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegatePlayParamForValue", async function () {
      const path = (await getPathInFile("isPlayParam.yml", 1, 9)) as Node[];
      const test = isPlayParam(path);
      expect(test).to.be.eq(false);
    });
  });

  describe("isBlockParam", function () {
    it("canCorrectlyConfirmBlockParam", async function () {
      const path = (await getPathInFile("isBlockParam.yml", 2, 3)) as Node[];
      const test = isBlockParam(path);
      expect(test).to.be.eq(true);
    });

    it("canCorrectlyNegateBlockParam", async function () {
      const path = (await getPathInFile("isBlockParam.yml", 5, 3)) as Node[];
      const test = isBlockParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegateBlockParamOnValue", async function () {
      const path = (await getPathInFile("isBlockParam.yml", 2, 11)) as Node[];
      const test = isBlockParam(path);
      expect(test).to.be.eq(false);
    });
  });

  describe("isRoleParam", function () {
    it("canCorrectlyConfirmRoleParam", async function () {
      const path = (await getPathInFile("isRoleParam.yml", 5, 7)) as Node[];
      const test = isRoleParam(path);
      expect(test).to.be.eq(true);
    });

    it("canCorrectlyNegateRoleParam", async function () {
      const path = (await getPathInFile("isRoleParam.yml", 4, 3)) as Node[];
      const test = isRoleParam(path);
      expect(test).to.be.eq(false);
    });

    it("canCorrectlyNegateRoleParamOnValue", async function () {
      const path = (await getPathInFile("isRoleParam.yml", 5, 13)) as Node[];
      const test = isRoleParam(path);
      expect(test).to.be.eq(false);
    });
  });

  describe("isCursorInsideJinjaBrackets", function () {
    const file = "isCursorInsideJinjaBrackets.yml";
    const document = getDoc(`yaml/${file}`);

    it("can confirm cursor within normal jinja bracket", async function () {
      const line = 5;
      const character = 26;
      const position = Position.create(line - 1, character - 1);
      const path = getPathInFile(file, line, character);
      if (path) {
        const test = isCursorInsideJinjaBrackets(document, position, path);
        expect(test).to.be.eq(true);
      } else {
        expect(false).toBe(true);
      }
    });

    it("can confirm cursor within jinja bracket in correct syntax", async function () {
      const line = 7;
      const character = 20;
      const position = Position.create(line - 1, character - 1);
      const path = getPathInFile(file, line, character);
      if (path) {
        const test = isCursorInsideJinjaBrackets(document, position, path);
        expect(test).to.be.eq(true);
      } else {
        expect(false).toBe(true);
      }
    });

    it("can confirm cursor within jinja bracket in case of multiple bracket pairs", async function () {
      const line = 9;
      const character = 48;
      const position = Position.create(line - 1, character - 1);
      const path = getPathInFile(file, line, character);
      if (path) {
        const test = isCursorInsideJinjaBrackets(document, position, path);
        expect(test).to.be.eq(true);
      } else {
        expect(false).toBe(true);
      }
    });

    it("can confirm cursor within jinja bracket even if text already present inside it", async function () {
      const line = 9;
      const character = 36;
      const position = Position.create(line - 1, character - 1);
      const path = getPathInFile(file, line, character);
      if (path) {
        const test = isCursorInsideJinjaBrackets(document, position, path);
        expect(test).to.be.eq(true);
      } else {
        expect(false).toBe(true);
      }
    });

    it("can negate cursor outside jinja bracket", async function () {
      const line = 9;
      const character = 21;
      const position = Position.create(line - 1, character - 1);
      const path = getPathInFile(file, line, character) as Node[];
      const test = isCursorInsideJinjaBrackets(document, position, path);

      expect(test).to.be.eq(false);
    });

    it("can negate cursor within jinja bracket in case of invalid yaml syntax", async function () {
      const line = 11;
      const character = 25;
      const position = Position.create(line - 1, character - 1);
      const path = getPathInFile(file, line, character) as Node[];
      const test = isCursorInsideJinjaBrackets(document, position, path);

      expect(test).to.be.eq(false);
    });
  });
});
