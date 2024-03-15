import { expect } from "chai";
import path = require("path");
import { globArray } from "../../src/utils/pathUtils";

describe("docsFinder", () => {
  const dir = path.resolve(__dirname, "..", "fixtures", "utils", "docsFinder");
  describe("globArray()", () => {
    const tests = [
      {
        name: "multiple patterns with '{}'",
        pattern: [`${dir}/*.{yaml,yml}`],
        filteredFiles: [`${dir}/4.yml`, `${dir}/5.yml`, `${dir}/6.yaml`],
      },
      {
        name: "array of file patterns",
        pattern: [`${dir}/*.yml`, `${dir}/*.json`],
        filteredFiles: [`${dir}/4.yml`, `${dir}/5.yml`, `${dir}/10.json`],
      },
      {
        name: "exclusion files with '!'",
        pattern: [`${dir}/*.py`, `!${dir}/_*.py`],
        filteredFiles: [`${dir}/1.py`, `${dir}/2.py`, `${dir}/3.py`],
      },
      {
        name: "array of file patterns and exclusion files with '!'",
        pattern: [
          `${dir}/*.py`,
          `${dir}/*.{yaml,yml}`,
          `!${dir}/_*.py`,
          `!${dir}/*.yml`,
        ],
        filteredFiles: [
          `${dir}/1.py`,
          `${dir}/2.py`,
          `${dir}/3.py`,
          `${dir}/6.yaml`,
        ],
      },
    ];

    tests.forEach(({ name, pattern, filteredFiles }) => {
      it(`should provide file path match for ${name}`, () => {
        const actualResult = globArray(pattern);
        expect(actualResult).to.have.members(filteredFiles);
      });
    });
  });
});
