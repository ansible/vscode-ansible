import { describe, expect, it } from "vitest";
import {
  filterLcovAgainstUnit,
  indexUnitCoverage,
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
});
