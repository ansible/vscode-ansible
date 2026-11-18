import { expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
  isFileReference,
  isTemplatedValue,
  resolveFileReference,
} from "@src/utils/fileReference.js";

describe("fileReference", function () {
  describe("isFileReference()", function () {
    it("matches a module option", function () {
      expect(isFileReference("template", "src")?.dirname).toBe("templates");
    });

    it("accepts builtin FQCN", function () {
      expect(isFileReference("ansible.builtin.copy", "src")).toBeDefined();
      expect(isFileReference("ansible.legacy.copy", "src")).toBeDefined();
    });

    it("rejects other collections", function () {
      expect(isFileReference("community.general.copy", "src")).toBeUndefined();
    });

    it("rejects unknown modules, including prototype keys", function () {
      expect(isFileReference("debug", "msg")).toBeUndefined();
      expect(isFileReference("constructor", "src")).toBeUndefined();
    });

    it("rejects unknown options", function () {
      expect(isFileReference("template", "dest")).toBeUndefined();
    });

    it("supports free-form values only where allowed", function () {
      expect(isFileReference("include_tasks", undefined)).toBeDefined();
      expect(isFileReference("template", undefined)).toBeUndefined();
    });

    it("supports include_vars dir", function () {
      const spec = isFileReference("include_vars", "dir");
      expect(spec).toBeDefined();
      expect(spec?.allowDirectory).toBe(true);
    });
  });

  describe("isTemplatedValue()", function () {
    it.each<[string, boolean]>([
      ["{{ x }}", true],
      ["{% if a %}b{% endif %}", true],
      ["plain.txt", false],
      ["", false],
    ])("%j -> %s", function (value: string, expected: boolean) {
      expect(isTemplatedValue(value)).toBe(expected);
    });
  });

  describe("resolveFileReference()", function () {
    let dir: string;
    let outside: string;
    let play: string;
    let roleTasks: string;

    beforeAll(async () => {
      dir = await mkdtemp(path.join(tmpdir(), "fileref-"));
      outside = await mkdtemp(path.join(tmpdir(), "fileref-out-"));
      play = path.join(dir, "play.yml");
      roleTasks = path.join(dir, "roles", "web", "tasks", "main.yml");

      await mkdir(path.join(dir, "templates"), { recursive: true });
      await mkdir(path.join(dir, "files", "sub"), { recursive: true });
      await mkdir(path.join(dir, "roles", "web", "tasks"), { recursive: true });
      await mkdir(path.join(dir, "roles", "web", "templates"), {
        recursive: true,
      });
      await writeFile(path.join(dir, "templates", "a.j2"), "x");
      await writeFile(path.join(dir, "files", "b.txt"), "x");
      await writeFile(path.join(dir, "roles", "web", "templates", "n.j2"), "x");
      await writeFile(path.join(outside, "secret.txt"), "x");
    });

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    });

    it("finds a file in the conventional directory", async function () {
      expect(await resolveFileReference("a.j2", "templates", play)).toBe(
        path.join(dir, "templates", "a.j2"),
      );
    });

    it("does not prepend dirname when already spelled", async function () {
      expect(await resolveFileReference("files/b.txt", "files", play)).toBe(
        path.join(dir, "files", "b.txt"),
      );
    });

    it("resolves inside a role", async function () {
      expect(await resolveFileReference("n.j2", "templates", roleTasks)).toBe(
        path.join(dir, "roles", "web", "templates", "n.j2"),
      );
    });

    it("falls back to basedirs", async function () {
      const elsewhere = path.join(outside, "x.yml");
      expect(
        await resolveFileReference("b.txt", "files", elsewhere, [dir]),
      ).toBe(path.join(dir, "files", "b.txt"));
    });

    it("returns undefined when nothing matches", async function () {
      expect(
        await resolveFileReference("nope.txt", "files", play),
      ).toBeUndefined();
    });

    it("allows traversal that stays inside a root", async function () {
      expect(
        await resolveFileReference(
          "templates/../files/b.txt",
          "templates",
          play,
        ),
      ).toBe(path.join(dir, "files", "b.txt"));
    });

    it("blocks traversal outside the roots", async function () {
      const rel = path.relative(dir, path.join(outside, "secret.txt"));
      expect(await resolveFileReference(rel, "files", play)).toBeUndefined();
      expect(
        await resolveFileReference(
          "../../../../../../../../etc/passwd",
          "files",
          play,
        ),
      ).toBeUndefined();
    });

    it("rejects symlinks that resolve outside the allowed roots", async function () {
      const link = path.join(dir, "files", "outside-dir");
      await symlink(
        outside,
        link,
        process.platform === "win32" ? "junction" : "dir",
      );

      expect(
        await resolveFileReference("outside-dir", "files", play, [], true),
      ).toBeUndefined();
    });

    it("accepts an absolute path inside a root", async function () {
      const abs = path.join(dir, "files", "b.txt");
      expect(await resolveFileReference(abs, "files", play)).toBe(abs);
    });

    it("rejects an absolute path outside the roots", async function () {
      const abs = path.join(outside, "secret.txt");
      expect(await resolveFileReference(abs, "files", play)).toBeUndefined();
    });

    it("does not expand home-relative paths", async function () {
      expect(
        await resolveFileReference("~", "files", play, [], true),
      ).toBeUndefined();
      expect(
        await resolveFileReference("~/x.txt", "files", play),
      ).toBeUndefined();
    });

    it.each<string>(["", "   ", "{{ file }}", "{% if a %}b{% endif %}"])(
      "returns undefined for %j",
      async function (value: string) {
        expect(
          await resolveFileReference(value, "files", play),
        ).toBeUndefined();
      },
    );

    it("honours allowDirectory", async function () {
      const sub = path.join(dir, "files", "sub");
      expect(
        await resolveFileReference("sub", "files", play, [], false),
      ).toBeUndefined();
      expect(await resolveFileReference("sub", "files", play, [], true)).toBe(
        sub,
      );
    });

    it("accepts the root itself as a directory", async function () {
      expect(await resolveFileReference(".", "", play, [], true)).toBe(dir);
    });

    it("finds a role root regardless of task file depth", async function () {
      const segments: string[] = Array.from({ length: 12 }, () => "d");
      const deep = path.join(
        dir,
        "roles",
        "web",
        "tasks",
        ...segments,
        "play.yml",
      );
      expect(await resolveFileReference("n.j2", "templates", deep)).toBe(
        path.join(dir, "roles", "web", "templates", "n.j2"),
      );
    });

    it("finds a role root within the search limit", async function () {
      const near = path.join(dir, "tasks", "d", "play.yml");
      expect(await resolveFileReference("a.j2", "templates", near)).toBe(
        path.join(dir, "templates", "a.j2"),
      );
    });
  });
});
