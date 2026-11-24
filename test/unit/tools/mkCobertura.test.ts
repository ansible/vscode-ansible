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
  excludeGeneratedSonarLcov,
  expandCoveredStatementLines,
  filterLcovAgainstUnit,
  indexUnitCoverage,
  isGeneratedSonarLcov,
  rewriteNonUnitLcov,
  writeSonarLcov,
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
    expect(filtered).toContain("BRDA:3,0,0,0");
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
    expect(filtered).toMatch(/BRDA:9,0,0,0/);
    expect(filtered).toMatch(/BRDA:9,0,1,-/);
    expect(filtered).toContain("BRF:2");
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
    expect(filtered).toContain("BRDA:3,0,0,0");
  });

  it("matches relative unit SF paths with absolute WDIO SF paths", () => {
    const absolute = path.resolve("src/example.ts");
    const other = `
SF:${absolute}
DA:1,0
DA:2,0
DA:3,0
LF:3
LH:0
end_of_record
`;
    const filtered = filterLcovAgainstUnit(other, indexUnitCoverage(unitLcov));
    expect(filtered).toMatch(/^DA:1,0$/m);
    expect(filtered).toMatch(/^DA:2,0$/m);
    expect(filtered).not.toMatch(/^DA:3,0$/m);
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
      expect(e2eText).toContain("BRDA:3,0,0,0");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe("rewriteNonUnitLcov unit reports", () => {
  it("does not persist synthetic statement-gap hits into unit lcov", () => {
    const root = mkdtempSync(path.join(tmpdir(), "mk-cobertura-unit-"));
    const unit = path.join(root, "unit", "lcov.info");
    const e2e = path.join(root, "e2e", "lcov.info");
    try {
      mkdirSync(path.dirname(unit), { recursive: true });
      mkdirSync(path.dirname(e2e), { recursive: true });
      const originalUnit = [
        "SF:src/example.ts",
        "DA:10,4",
        "DA:13,2",
        "end_of_record",
        "",
      ].join("\n");
      writeFileSync(unit, originalUnit);
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

      rewriteNonUnitLcov([unit, e2e]);

      expect(readFileSync(unit, "utf8")).toBe(originalUnit);
      const e2eText = readFileSync(e2e, "utf8");
      expectDaLine(e2eText, "10,0");
      expectDaLine(e2eText, "13,0");
      expect(e2eText).not.toMatch(/^DA:11,/m);
      expect(e2eText).not.toMatch(/^DA:12,/m);
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

  it("does not fill a gap beside an uncovered line in the unit index", () => {
    const unitIndex = indexUnitCoverage(`
SF:src/example.ts
DA:2,0
end_of_record
`);
    const expanded = expandCoveredStatementLines(
      `
SF:src/example.ts
DA:1,7
DA:4,7
LF:2
LH:2
end_of_record
`,
      unitIndex,
    );
    expectDaLine(expanded, "1,7");
    expectDaLine(expanded, "4,7");
    expect(expanded).not.toMatch(/^DA:2,/m);
    expect(expanded).not.toMatch(/^DA:3,/m);
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

describe("excludeGeneratedSonarLcov", () => {
  it("drops prior sonar/lcov.info so stale hits cannot re-enter the merge", () => {
    const root = mkdtempSync(path.join(tmpdir(), "mk-cobertura-inputs-"));
    try {
      const unit = path.join(root, "unit", "lcov.info");
      const e2e = path.join(root, "e2e", "lcov.info");
      const sonar = path.join(root, "sonar", "lcov.info");
      const filtered = excludeGeneratedSonarLcov([unit, e2e, sonar]);
      expect(isGeneratedSonarLcov(sonar)).toBe(true);
      expect(filtered).toEqual([unit, e2e]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe("writeSonarLcov", () => {
  it("writes merged lcov beside the cobertura output without touching unit reports", () => {
    const root = mkdtempSync(path.join(tmpdir(), "mk-cobertura-sonar-"));
    try {
      const cobertura = path.join(root, "cobertura-coverage.xml");
      const dest = writeSonarLcov(
        cobertura,
        "SF:src/example.ts\nDA:1,1\nend_of_record\n",
      );
      expect(dest).toBe(path.join(root, "sonar", "lcov.info"));
      expect(readFileSync(dest, "utf8")).toContain("DA:1,1");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
