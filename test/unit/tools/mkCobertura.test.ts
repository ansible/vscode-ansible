import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  expandCoveredStatementLines,
  filterLcovAgainstUnit,
  indexUnitCoverage,
  rewriteNonUnitLcov,
  rewriteUnitLcov,
} from "@root/tools/mk-cobertura";

function expectDaLine(output: string, spec: string): void {
  expect(output).toMatch(new RegExp(`^DA:${spec}$`, "m"));
}

const unitLcov = `
SF:src/example.ts
DA:1,3
DA:2,0
BRDA:1,0,0,1
BRDA:1,0,1,0
LF:2
LH:1
end_of_record
`;

describe("filterLcovAgainstUnit", () => {
  it("drops zero hits on lines the unit report did not instrument", () => {
    const other = `
SF:src/example.ts
DA:1,0
DA:2,0
DA:3,0
DA:9,4
BRDA:1,0,0,0
BRDA:3,0,0,0
BRDA:9,0,0,2
LF:4
LH:1
end_of_record
SF:src/e2e-only.ts
DA:4,0
LF:1
LH:0
end_of_record
`;
    const filtered = filterLcovAgainstUnit(other, indexUnitCoverage(unitLcov));
    expect(filtered).toContain("SF:src/example.ts");
    expect(filtered).toMatch(/^DA:1,0$/m);
    expect(filtered).toMatch(/^DA:2,0$/m);
    expect(filtered).toMatch(/^DA:9,4$/m);
    expect(filtered).not.toMatch(/^DA:3,0$/m);
    expect(filtered).toContain("BRDA:1,0,0,0");
    expect(filtered).toContain("BRDA:9,0,0,2");
    expect(filtered).not.toContain("BRDA:3,0,0,0");
    expect(filtered).toContain("SF:src/e2e-only.ts");
    expectDaLine(filtered, "4,0");
    expect(filtered).toContain("LF:3");
    expect(filtered).toContain("LH:1");
  });

  it("treats CRLF BRDA hit values as misses when filtering", () => {
    const other = `
SF:src/example.ts
BRDA:9,0,0,0\r
BRDA:9,0,1,-\r
LF:0
LH:0
end_of_record
`;
    const filtered = filterLcovAgainstUnit(other, indexUnitCoverage(unitLcov));
    expect(filtered).not.toMatch(/BRDA:9,0,0/);
    expect(filtered).not.toMatch(/BRDA:9,0,1/);
    expect(filtered).toContain("BRF:0");
    expect(filtered).toContain("BRH:0");
  });

  it("keeps lines and branches from every record for one source file", () => {
    const repeated = `
SF:src/example.ts
DA:1,0
BRDA:1,0,0,0
end_of_record
SF:src/example.ts
DA:2,0
BRDA:2,0,0,0
end_of_record
`;
    const other = `
SF:src/example.ts
DA:1,0
DA:2,0
DA:3,0
BRDA:1,0,0,0
BRDA:2,0,0,0
BRDA:3,0,0,0
end_of_record
`;
    const filtered = filterLcovAgainstUnit(other, indexUnitCoverage(repeated));
    expect(filtered).toMatch(/^DA:1,0$/m);
    expect(filtered).toMatch(/^DA:2,0$/m);
    expect(filtered).not.toMatch(/^DA:3,0$/m);
    expect(filtered).toContain("BRDA:1,0,0,0");
    expect(filtered).toContain("BRDA:2,0,0,0");
    expect(filtered).not.toContain("BRDA:3,0,0,0");
  });
});

describe("rewriteNonUnitLcov", () => {
  it("indexes every unit report and leaves those reports unfiltered", () => {
    const root = mkdtempSync(path.join(tmpdir(), "mk-cobertura-"));
    const firstUnit = path.join(root, "a", "unit", "first.info");
    const secondUnit = path.join(root, "b", "unit", "second.info");
    const e2e = path.join(root, "e2e", "lcov.info");
    try {
      mkdirSync(path.dirname(firstUnit), { recursive: true });
      mkdirSync(path.dirname(secondUnit), { recursive: true });
      mkdirSync(path.dirname(e2e), { recursive: true });
      writeFileSync(
        firstUnit,
        "SF:src/example.ts\nDA:1,0\nBRDA:1,0,0,0\nend_of_record\n",
      );
      writeFileSync(
        secondUnit,
        "SF:src/example.ts\nDA:2,0\nBRDA:2,0,0,0\nend_of_record\n",
      );
      writeFileSync(
        e2e,
        [
          "SF:src/example.ts",
          "DA:1,0",
          "DA:2,0",
          "DA:3,0",
          "BRDA:1,0,0,0",
          "BRDA:2,0,0,0",
          "BRDA:3,0,0,0",
          "end_of_record",
          "",
        ].join("\n"),
      );

      rewriteNonUnitLcov([firstUnit, secondUnit, e2e]);

      const secondText = readFileSync(secondUnit, "utf8");
      expectDaLine(secondText, "2,0");
      expect(secondText).toContain("BRDA:2,0,0,0");
      const e2eText = readFileSync(e2e, "utf8");
      expectDaLine(e2eText, "1,0");
      expectDaLine(e2eText, "2,0");
      expect(e2eText).not.toMatch(/^DA:3,0$/m);
      expect(e2eText).toContain("BRDA:2,0,0,0");
      expect(e2eText).not.toContain("BRDA:3,0,0,0");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe("rewriteUnitLcov", () => {
  it("writes covered statement gaps into the unit report Sonar reads", () => {
    const root = mkdtempSync(path.join(tmpdir(), "mk-cobertura-unit-"));
    const unit = path.join(root, "unit", "lcov.info");
    const e2e = path.join(root, "e2e", "lcov.info");
    try {
      mkdirSync(path.dirname(unit), { recursive: true });
      mkdirSync(path.dirname(e2e), { recursive: true });
      writeFileSync(
        unit,
        ["SF:src/example.ts", "DA:10,4", "DA:13,2", "end_of_record", ""].join(
          "\n",
        ),
      );
      writeFileSync(
        e2e,
        [
          "SF:src/example.ts",
          "DA:10,0",
          "DA:11,0",
          "DA:12,0",
          "DA:13,0",
          "end_of_record",
          "",
        ].join("\n"),
      );

      const inputs = [unit, e2e];
      rewriteNonUnitLcov(inputs);
      rewriteUnitLcov(inputs);

      const unitText = readFileSync(unit, "utf8");
      expectDaLine(unitText, "11,4");
      expectDaLine(unitText, "12,4");
      const e2eText = readFileSync(e2e, "utf8");
      expectDaLine(e2eText, "10,0");
      expectDaLine(e2eText, "13,0");
      expect(e2eText).not.toMatch(/^DA:11,/m);
      expect(e2eText).not.toMatch(/^DA:12,/m);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("does not turn a real unit miss into a hit", () => {
    const root = mkdtempSync(path.join(tmpdir(), "mk-cobertura-unit-miss-"));
    const unit = path.join(root, "unit", "lcov.info");
    try {
      mkdirSync(path.dirname(unit), { recursive: true });
      writeFileSync(
        unit,
        ["SF:src/example.ts", "DA:10,4", "DA:13,0", "end_of_record", ""].join(
          "\n",
        ),
      );

      rewriteUnitLcov([unit]);

      const unitText = readFileSync(unit, "utf8");
      expectDaLine(unitText, "10,4");
      expectDaLine(unitText, "13,0");
      expect(unitText).not.toMatch(/^DA:11,/m);
      expect(unitText).not.toMatch(/^DA:12,/m);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe("expandCoveredStatementLines", () => {
  it("copies hits across a gap bounded by two covered lines", () => {
    const expanded = expandCoveredStatementLines(`
SF:src/example.ts
DA:1,4
DA:4,2
LF:2
LH:2
end_of_record
`);
    expectDaLine(expanded, "1,4");
    expectDaLine(expanded, "2,4");
    expectDaLine(expanded, "3,4");
    expectDaLine(expanded, "4,2");
    expect(expanded).toContain("LF:4");
    expect(expanded).toContain("LH:4");
  });

  it("leaves gaps next to an uncovered line empty", () => {
    const expanded = expandCoveredStatementLines(`
SF:src/example.ts
DA:10,4
DA:13,0
LF:2
LH:1
end_of_record
`);
    expectDaLine(expanded, "10,4");
    expectDaLine(expanded, "13,0");
    expect(expanded).not.toMatch(/^DA:11,/m);
    expect(expanded).not.toMatch(/^DA:12,/m);
  });

  it("does not fill the leading gap when the first instrumented line is uncovered", () => {
    const expanded = expandCoveredStatementLines(`
SF:src/example.ts
DA:1,0
DA:4,7
LF:2
LH:1
end_of_record
`);
    expectDaLine(expanded, "1,0");
    expectDaLine(expanded, "4,7");
    expect(expanded).not.toMatch(/^DA:2,/m);
    expect(expanded).not.toMatch(/^DA:3,/m);
  });

  it("fills a short signature before the first covered line", () => {
    const expanded = expandCoveredStatementLines(`
SF:src/example.ts
DA:4,7
LF:1
LH:1
end_of_record
`);
    expectDaLine(expanded, "1,7");
    expectDaLine(expanded, "3,7");
    expectDaLine(expanded, "4,7");
  });

  it("produces the same expansion from unchanged raw unit input", () => {
    const source = `
SF:src/example.ts
DA:20,1
LF:1
LH:1
end_of_record
`;
    expect(expandCoveredStatementLines(source)).toBe(
      expandCoveredStatementLines(source),
    );
  });

  it("does not synthesize hits on lines measured in another unit record", () => {
    const unitIndex = indexUnitCoverage(`
SF:src/example.ts
DA:1,0
end_of_record
`);
    const expanded = expandCoveredStatementLines(
      `
SF:src/example.ts
DA:4,7
LF:1
LH:1
end_of_record
`,
      unitIndex,
    );
    expect(expanded).not.toMatch(/^DA:1,7$/m);
    expectDaLine(expanded, "4,7");
  });
});
