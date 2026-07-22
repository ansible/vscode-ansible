import { expect, describe, it, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LazyModuleDocumentation } from "@src/utils/docsParser.js";

describe("LazyModuleDocumentation", function () {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function writeModule(fileName: string, source: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "als-docs-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, source);
    return filePath;
  }

  it("parses DOCUMENTATION from a well-formed module", function () {
    const filePath = writeModule(
      "good.py",
      [
        "DOCUMENTATION = '''",
        "module: ping",
        "short_description: Test",
        "'''",
        "",
      ].join("\n"),
    );

    const docs = new LazyModuleDocumentation(
      filePath,
      "ansible.builtin.ping",
      "ansible",
      "builtin",
      "ping",
    );

    expect(docs.rawDocumentationFragments.has("DOCUMENTATION")).toBe(true);
    expect(docs.rawDocumentationFragments.get("DOCUMENTATION")).toMatchObject({
      module: "ping",
      short_description: "Test",
    });
  });

  it("does not leak regex state when a prior module has unclosed quotes", function () {
    const brokenPath = writeModule(
      "broken.py",
      ["DOCUMENTATION = '''", "module: broken", "short_description: oops"].join(
        "\n",
      ),
    );
    const goodPath = writeModule(
      "good.py",
      [
        "DOCUMENTATION = '''",
        "module: ping",
        "short_description: Test",
        "'''",
        "",
      ].join("\n"),
    );

    const broken = new LazyModuleDocumentation(
      brokenPath,
      "ns.col.broken",
      "ns",
      "col",
      "broken",
    );
    expect(broken.rawDocumentationFragments.has("DOCUMENTATION")).toBe(false);

    const good = new LazyModuleDocumentation(
      goodPath,
      "ansible.builtin.ping",
      "ansible",
      "builtin",
      "ping",
    );
    expect(good.rawDocumentationFragments.has("DOCUMENTATION")).toBe(true);
    expect(good.rawDocumentationFragments.get("DOCUMENTATION")).toMatchObject({
      module: "ping",
    });
  });

  it("keeps scanning after an unclosed opener in the same file", function () {
    // Use a different quote style for EXAMPLES so the unclosed DOCUMENTATION
    // opener cannot be closed by the EXAMPLES terminator.
    const filePath = writeModule(
      "partial.py",
      [
        "DOCUMENTATION = '''",
        "module: broken",
        'EXAMPLES = """',
        "- ping:",
        '"""',
        "",
      ].join("\n"),
    );

    const docs = new LazyModuleDocumentation(
      filePath,
      "ns.col.partial",
      "ns",
      "col",
      "partial",
    );

    expect(docs.rawDocumentationFragments.has("DOCUMENTATION")).toBe(false);
    expect(docs.rawDocumentationFragments.has("EXAMPLES")).toBe(true);
  });
});
