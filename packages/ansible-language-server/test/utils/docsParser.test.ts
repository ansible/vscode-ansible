import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { LazyModuleDocumentation } from "@src/utils/docsParser.js";

const DOCUMENTATION = "DOCUMENTATION";
const DOC_BODY = "module: sample\nshort_description: A sample";

describe("LazyModuleDocumentation", function () {
  let dir: string;
  let count = 0;

  beforeAll(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "docs-parser-"));
  });

  afterAll(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function moduleFrom(contents: string): LazyModuleDocumentation {
    const source = path.join(dir, `module_${count++}.py`);
    fs.writeFileSync(source, contents);
    return new LazyModuleDocumentation(
      source,
      "ns.col.sample",
      "ns",
      "col",
      "sample",
    );
  }

  // The primary regex consumes an assignment nested in another triple-quoted
  // string, which leaves DOCUMENTATION for the fallback to find.
  const nested = {
    "triple-double-quoted": `#!/usr/bin/python\n\nNOTES = '''\nDOCUMENTATION = """\n${DOC_BODY}\n"""\n'''\n`,
    "triple-single-quoted": `#!/usr/bin/python\n\nNOTES = """\nDOCUMENTATION = '''\n${DOC_BODY}\n'''\n"""\n`,
  };

  describe("fallback for DOCUMENTATION", function () {
    for (const [name, contents] of Object.entries(nested)) {
      it(`parses a ${name} assignment`, function () {
        const fragments = moduleFrom(contents).rawDocumentationFragments;

        expect(fragments.get(DOCUMENTATION)).toEqual({
          module: "sample",
          short_description: "A sample",
        });
      });

      it(`sets the range of a ${name} assignment`, function () {
        const module = moduleFrom(contents);
        expect(module.rawDocumentationFragments.has(DOCUMENTATION)).toBe(true);

        // Lines 0-1 are the header, 2 is NOTES, 3 is the assignment, and the
        // documentation fills lines 4-5.
        expect(module.sourceLineRange).toEqual([4, 6]);
      });
    }

    it("skips a YAML document marker, as the primary regex does", function () {
      const module = moduleFrom(
        `NOTES = '''\nDOCUMENTATION = """\n---\n${DOC_BODY}\n"""\n'''\n`,
      );

      expect(module.rawDocumentationFragments.get(DOCUMENTATION)).toEqual({
        module: "sample",
        short_description: "A sample",
      });
      expect(module.sourceLineRange).toEqual([3, 5]);
    });

    it("starts the range of empty documentation after the quotes", function () {
      const module = moduleFrom(`NOTES = '''\nDOCUMENTATION = """\n"""\n'''\n`);

      expect(module.rawDocumentationFragments.has(DOCUMENTATION)).toBe(true);
      expect(module.sourceLineRange).toEqual([2, 2]);
    });

    it("does not look for short documentation in the assignment", function () {
      const module = moduleFrom(
        `NOTES = '''\nDOCUMENTATION = """\nDOC"""\n'''\n`,
      );

      expect(module.rawDocumentationFragments.has(DOCUMENTATION)).toBe(true);
      expect(module.sourceLineRange).toEqual([2, 2]);
    });

    it("counts a blank first line as part of the documentation", function () {
      const module = moduleFrom(
        `NOTES = '''\nDOCUMENTATION = """\n\nmodule: sample\n"""\n'''\n`,
      );

      expect(module.rawDocumentationFragments.has(DOCUMENTATION)).toBe(true);
      expect(module.sourceLineRange).toEqual([2, 4]);
    });

    it("runs when another assignment was parsed", function () {
      const fragments = moduleFrom(
        `EXAMPLES = r'''\n- name: Example\n'''\n${nested["triple-single-quoted"]}`,
      ).rawDocumentationFragments;

      expect(fragments.has("EXAMPLES")).toBe(true);
      expect(fragments.get(DOCUMENTATION)).toMatchObject({ module: "sample" });
    });

    it("does not replace a DOCUMENTATION the primary regex found", function () {
      const module = moduleFrom(
        `NOTES = '''\nDOCUMENTATION = """\nmodule: nested\n"""\n'''\nDOCUMENTATION = """\nmodule: primary\n"""\n`,
      );

      expect(module.rawDocumentationFragments.get(DOCUMENTATION)).toEqual({
        module: "primary",
      });
      expect(module.sourceLineRange).toEqual([6, 7]);
    });

    it("reports YAML errors in the documentation", function () {
      const module = moduleFrom(
        `NOTES = '''\nDOCUMENTATION = """\nmodule: [unclosed\n"""\n'''\nEXAMPLES = r'''\n- name: Example\n'''\n`,
      );

      expect(module.rawDocumentationFragments.has(DOCUMENTATION)).toBe(true);
      expect(module.errors).not.toHaveLength(0);
    });

    it("leaves a module without DOCUMENTATION unchanged", function () {
      const module = moduleFrom(`EXAMPLES = r'''\n- name: Example\n'''\n`);

      expect(module.rawDocumentationFragments.has(DOCUMENTATION)).toBe(false);
      expect(module.sourceLineRange).toEqual([0, 0]);
    });
  });

  it("gives the same range on the primary path", function () {
    const module = moduleFrom(
      `#!/usr/bin/python\n\n\n\nDOCUMENTATION = """\n${DOC_BODY}\n"""\n`,
    );
    expect(module.rawDocumentationFragments.has(DOCUMENTATION)).toBe(true);

    expect(module.sourceLineRange).toEqual([5, 7]);
  });
});
