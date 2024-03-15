import { EOL } from "os";
import { resolveSuffix } from "../../src/providers/completionProvider";
import { expect } from "chai";

function testResolveSuffixInPlaybook() {
  const tests = [
    {
      optionType: "dict",
      firstElementOfList: true,
      isPlaybook: true,
      expectedSuffix: `${EOL}\t\t`,
    },
    {
      optionType: "list",
      firstElementOfList: true,
      isPlaybook: true,
      expectedSuffix: `${EOL}\t\t- `,
    },
    {
      optionType: "string",
      firstElementOfList: true,
      isPlaybook: true,
      expectedSuffix: " ",
    },
  ];

  tests.forEach(
    ({ optionType, firstElementOfList, isPlaybook, expectedSuffix }) => {
      it(`should provide suffix for '${optionType}' type options in a playbook`, function () {
        const actualSuffix = resolveSuffix(
          optionType,
          firstElementOfList,
          isPlaybook,
        );

        expect(actualSuffix).to.equal(expectedSuffix);
      });
    },
  );
}

function testResolveSuffixInNonPlaybookFile() {
  const tests = [
    {
      optionType: "dict",
      firstElementOfList: true,
      isPlaybook: false,
      expectedSuffix: `${EOL}\t`,
    },
    {
      optionType: "list",
      firstElementOfList: true,
      isPlaybook: false,
      expectedSuffix: `${EOL}\t- `,
    },
    {
      optionType: "string",
      firstElementOfList: true,
      isPlaybook: false,
      expectedSuffix: " ",
    },
  ];

  tests.forEach(
    ({ optionType, firstElementOfList, isPlaybook, expectedSuffix }) => {
      it(`should provide suffix for '${optionType}' type options in a non-playbook file`, function () {
        const actualSuffix = resolveSuffix(
          optionType,
          firstElementOfList,
          isPlaybook,
        );

        expect(actualSuffix).to.equal(expectedSuffix);
      });
    },
  );
}

describe("resolveSuffix", function () {
  describe("Resolve suffix for completion items in a playbook", function () {
    testResolveSuffixInPlaybook();
  });

  describe("Resolve suffix for completion items in a non-playbook file", function () {
    testResolveSuffixInNonPlaybookFile();
  });
});
