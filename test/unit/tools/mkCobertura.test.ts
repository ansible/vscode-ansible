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
} from "@root/tools/mk-cobertura";

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
    expect(filtered).toContain("DA:1,0");
    expect(filtered).toContain("DA:2,0");
    expect(filtered).toContain("DA:9,4");
    expect(filtered).not.toContain("DA:3,0");
    expect(filtered).toContain("BRDA:1,0,0,0");
    expect(filtered).toContain("BRDA:9,0,0,2");
    expect(filtered).not.toContain("BRDA:3,0,0,0");
    expect(filtered).toContain("SF:src/e2e-only.ts");
    expect(filtered).toContain("DA:4,0");
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
    expect(filtered).toContain("DA:1,0");
    expect(filtered).toContain("DA:2,0");
    expect(filtered).not.toContain("DA:3,0");
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
      expect(secondText).toContain("DA:2,0");
      expect(secondText).toContain("BRDA:2,0,0,0");
      const e2eText = readFileSync(e2e, "utf8");
      expect(e2eText).toContain("DA:1,0");
      expect(e2eText).toContain("DA:2,0");
      expect(e2eText).not.toContain("DA:3,0");
      expect(e2eText).toContain("BRDA:2,0,0,0");
      expect(e2eText).not.toContain("BRDA:3,0,0,0");
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
    expect(expanded).toContain("DA:1,4");
    expect(expanded).toContain("DA:2,4");
    expect(expanded).toContain("DA:3,4");
    expect(expanded).toContain("DA:4,2");
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
    expect(expanded).toContain("DA:10,4");
    expect(expanded).toContain("DA:13,0");
    expect(expanded).not.toContain("DA:11,");
    expect(expanded).not.toContain("DA:12,");
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
    expect(expanded).toContain("DA:1,0");
    expect(expanded).toContain("DA:4,7");
    expect(expanded).not.toContain("DA:2,");
    expect(expanded).not.toContain("DA:3,");
  });

  it("fills a short signature before the first covered line", () => {
    const expanded = expandCoveredStatementLines(`
SF:src/example.ts
DA:4,7
LF:1
LH:1
end_of_record
`);
    expect(expanded).toContain("DA:1,7");
    expect(expanded).toContain("DA:3,7");
    expect(expanded).toContain("DA:4,7");
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
    expect(expanded).not.toContain("DA:1,7");
    expect(expanded).toContain("DA:4,7");
  });
});
