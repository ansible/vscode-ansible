import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitHubCollectionCache } from "../../src/services/GitHubCollectionCache";

function resetGitHubCacheSingleton(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (GitHubCollectionCache as any)._instance = undefined;
}

describe("GitHubCollectionCache", () => {
  let tmpHome: string;
  let cacheDir: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    resetGitHubCacheSingleton();
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ansible-gh-cache-"));
    previousHome = process.env.HOME;
    process.env.HOME = tmpHome;
    cacheDir = path.join(tmpHome, ".cache", "ansible-environments");
    fs.mkdirSync(cacheDir, { recursive: true });
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    fs.rmSync(tmpHome, { recursive: true, force: true });
    resetGitHubCacheSingleton();
  });

  it("getInstance returns the same singleton", () => {
    const a = GitHubCollectionCache.getInstance();
    const b = GitHubCollectionCache.getInstance();
    expect(a).toBe(b);
  });

  it("loadFromDisk reads and parses cache file", () => {
    const org = "ansible";
    const payload = {
      org,
      lastUpdated: "2024-06-01T12:00:00.000Z",
      collections: [
        {
          namespace: "ansible",
          name: "posix",
          version: "1.5.0",
          description: "POSIX modules",
          repository: "ansible-collections/ansible.posix",
          org,
          htmlUrl: "https://github.com/ansible-collections/ansible.posix",
          installUrl: "git+https://github.com/ansible-collections/ansible.posix.git",
        },
      ],
    };
    fs.writeFileSync(path.join(cacheDir, `github-${org}.json`), JSON.stringify(payload), "utf-8");
    const svc = GitHubCollectionCache.getInstance();
    const loaded = svc.loadFromDisk(org);
    expect(loaded).toEqual(payload);
    expect(svc.getCollections(org)).toEqual(payload.collections);
  });

  it("loadFromDisk returns undefined for missing file", () => {
    const svc = GitHubCollectionCache.getInstance();
    expect(svc.loadFromDisk("nonexistent-org-xyz")).toBeUndefined();
  });

  it("loadFromDisk handles corrupted JSON gracefully", () => {
    const org = "badjson";
    fs.writeFileSync(path.join(cacheDir, `github-${org}.json`), "{ not valid json", "utf-8");
    const log = vi.fn();
    const svc = GitHubCollectionCache.getInstance();
    svc.setLogFunction(log);
    expect(svc.loadFromDisk(org)).toBeUndefined();
    expect(log).toHaveBeenCalled();
  });

  it("getCollections returns collections for a loaded org", () => {
    const org = "acme";
    const collections = [
      {
        namespace: "acme",
        name: "demo",
        version: "1.0.0",
        description: "Demo",
        repository: "acme/demo",
        org,
        htmlUrl: "https://github.com/acme/demo",
        installUrl: "git+https://github.com/acme/demo.git",
      },
    ];
    fs.writeFileSync(
      path.join(cacheDir, `github-${org}.json`),
      JSON.stringify({ org, collections, lastUpdated: "2024-01-01T00:00:00.000Z" }),
      "utf-8",
    );
    const svc = GitHubCollectionCache.getInstance();
    svc.loadFromDisk(org);
    expect(svc.getCollections(org)).toEqual(collections);
  });

  it("getCollections returns empty array for unknown org", () => {
    const svc = GitHubCollectionCache.getInstance();
    expect(svc.getCollections("unknown-org-123")).toEqual([]);
  });

  it("getAllCollections aggregates across orgs", () => {
    const svc = GitHubCollectionCache.getInstance();
    for (const org of ["orga", "orgb"]) {
      fs.writeFileSync(
        path.join(cacheDir, `github-${org}.json`),
        JSON.stringify({
          org,
          lastUpdated: "2024-01-01T00:00:00.000Z",
          collections: [
            {
              namespace: org,
              name: "foo",
              version: "1.0.0",
              description: `${org} foo`,
              repository: `${org}/foo`,
              org,
              htmlUrl: `https://github.com/${org}/foo`,
              installUrl: `git+https://github.com/${org}/foo.git`,
            },
          ],
        }),
        "utf-8",
      );
      svc.loadFromDisk(org);
    }
    const all = svc.getAllCollections();
    expect(all).toHaveLength(2);
    expect(new Set(all.map((c) => c.repository))).toEqual(new Set(["orga/foo", "orgb/foo"]));
  });

  it("getCount returns correct count", () => {
    const org = "countme";
    fs.writeFileSync(
      path.join(cacheDir, `github-${org}.json`),
      JSON.stringify({
        org,
        lastUpdated: "2024-01-01T00:00:00.000Z",
        collections: [
          {
            namespace: "c",
            name: "one",
            version: "1.0.0",
            description: "",
            repository: "c/one",
            org,
            htmlUrl: "https://github.com/c/one",
            installUrl: "git+https://github.com/c/one.git",
          },
          {
            namespace: "c",
            name: "two",
            version: "1.0.0",
            description: "",
            repository: "c/two",
            org,
            htmlUrl: "https://github.com/c/two",
            installUrl: "git+https://github.com/c/two.git",
          },
        ],
      }),
      "utf-8",
    );
    const svc = GitHubCollectionCache.getInstance();
    svc.loadFromDisk(org);
    expect(svc.getCount(org)).toBe(2);
    expect(svc.getCount("missing")).toBe(0);
  });

  it("getLastUpdated returns date or undefined", () => {
    const org = "dated";
    const iso = "2024-03-15T08:30:00.000Z";
    fs.writeFileSync(
      path.join(cacheDir, `github-${org}.json`),
      JSON.stringify({ org, collections: [], lastUpdated: iso }),
      "utf-8",
    );
    const svc = GitHubCollectionCache.getInstance();
    svc.loadFromDisk(org);
    expect(svc.getLastUpdated(org)?.toISOString()).toBe(iso);
    expect(svc.getLastUpdated("nope")).toBeUndefined();
  });

  it("search matches by FQCN (namespace.name)", () => {
    const org = "searchfqcn";
    fs.writeFileSync(
      path.join(cacheDir, `github-${org}.json`),
      JSON.stringify({
        org,
        lastUpdated: "2024-01-01T00:00:00.000Z",
        collections: [
          {
            namespace: "myns",
            name: "widgets",
            version: "1.0.0",
            description: "Unrelated text",
            repository: "myns/widgets",
            org,
            htmlUrl: "https://github.com/myns/widgets",
            installUrl: "git+https://github.com/myns/widgets.git",
          },
        ],
      }),
      "utf-8",
    );
    const svc = GitHubCollectionCache.getInstance();
    svc.loadFromDisk(org);
    expect(svc.search("myns.widgets")).toHaveLength(1);
  });

  it("search matches by description", () => {
    const org = "searchdesc";
    fs.writeFileSync(
      path.join(cacheDir, `github-${org}.json`),
      JSON.stringify({
        org,
        lastUpdated: "2024-01-01T00:00:00.000Z",
        collections: [
          {
            namespace: "x",
            name: "y",
            version: "1.0.0",
            description: "Unique elephant phrase",
            repository: "x/y",
            org,
            htmlUrl: "https://github.com/x/y",
            installUrl: "git+https://github.com/x/y.git",
          },
        ],
      }),
      "utf-8",
    );
    const svc = GitHubCollectionCache.getInstance();
    svc.loadFromDisk(org);
    expect(svc.search("elephant")).toHaveLength(1);
  });

  it("search is case-insensitive", () => {
    const org = "casetest";
    fs.writeFileSync(
      path.join(cacheDir, `github-${org}.json`),
      JSON.stringify({
        org,
        lastUpdated: "2024-01-01T00:00:00.000Z",
        collections: [
          {
            namespace: "Big",
            name: "Small",
            version: "1.0.0",
            description: "MiXeD CaSe DeSc",
            repository: "Big/Small",
            org,
            htmlUrl: "https://github.com/Big/Small",
            installUrl: "git+https://github.com/Big/Small.git",
          },
        ],
      }),
      "utf-8",
    );
    const svc = GitHubCollectionCache.getInstance();
    svc.loadFromDisk(org);
    expect(svc.search("big.small")).toHaveLength(1);
    expect(svc.search("mixed case")).toHaveLength(1);
  });

  it("search returns empty for no matches", () => {
    const org = "nomatch";
    fs.writeFileSync(
      path.join(cacheDir, `github-${org}.json`),
      JSON.stringify({
        org,
        lastUpdated: "2024-01-01T00:00:00.000Z",
        collections: [
          {
            namespace: "a",
            name: "b",
            version: "1.0.0",
            description: "cd",
            repository: "a/b",
            org,
            htmlUrl: "https://github.com/a/b",
            installUrl: "git+https://github.com/a/b.git",
          },
        ],
      }),
      "utf-8",
    );
    const svc = GitHubCollectionCache.getInstance();
    svc.loadFromDisk(org);
    expect(svc.search("zzznomatchzzz")).toEqual([]);
  });

  it("_parseGalaxyYml parses galaxy.yml-shaped content (via private API)", () => {
    const svc = GitHubCollectionCache.getInstance();
    const yaml = `namespace: demo_ns
name: demo_name
version: 2.0.0
description: Parsed from YAML
`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const col = (svc as any)._parseGalaxyYml(yaml, "demo_org/demo_repo", "demo_org");
    expect(col).toEqual({
      namespace: "demo_ns",
      name: "demo_name",
      version: "2.0.0",
      description: "Parsed from YAML",
      repository: "demo_org/demo_repo",
      org: "demo_org",
      htmlUrl: "https://github.com/demo_org/demo_repo",
      installUrl: "git+https://github.com/demo_org/demo_repo.git",
    });
  });

  it("isRefreshing returns false when not refreshing", () => {
    const svc = GitHubCollectionCache.getInstance();
    expect(svc.isRefreshing("any-org")).toBe(false);
  });

  it("refresh no-ops when vscode is not available (standalone mode)", async () => {
    const log = vi.fn();
    const svc = GitHubCollectionCache.getInstance();
    svc.setLogFunction(log);
    await svc.refresh("some-org");
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Cannot refresh some-org - not in VS Code context"),
    );
  });

  it("_formatAge returns just now, minutes, hours, and days (private API)", () => {
    const svc = GitHubCollectionCache.getInstance();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fmt = (svc as any)._formatAge.bind(svc) as (ms: number) => string;
    expect(fmt(30 * 1000)).toBe("just now");
    expect(fmt(3 * 60 * 1000)).toBe("3 minutes ago");
    expect(fmt(2 * 60 * 60 * 1000)).toBe("2 hours ago");
    expect(fmt(50 * 60 * 60 * 1000)).toMatch(/^\d+ days? ago$/);
  });

  it("initialize loads each org from disk when cache files exist", async () => {
    for (const org of ["inita", "initb"]) {
      fs.writeFileSync(
        path.join(cacheDir, `github-${org}.json`),
        JSON.stringify({
          org,
          lastUpdated: "2024-01-01T00:00:00.000Z",
          collections: [
            {
              namespace: org,
              name: "c",
              version: "1.0.0",
              description: "",
              repository: `${org}/c`,
              org,
              htmlUrl: `https://github.com/${org}/c`,
              installUrl: `git+https://github.com/${org}/c.git`,
            },
          ],
        }),
        "utf-8",
      );
    }
    const svc = GitHubCollectionCache.getInstance();
    await svc.initialize(["inita", "initb"]);
    expect(svc.getCount("inita")).toBe(1);
    expect(svc.getCount("initb")).toBe(1);
  });

  it("refreshAll invokes refresh for every org (standalone no-ops)", async () => {
    const log = vi.fn();
    const svc = GitHubCollectionCache.getInstance();
    svc.setLogFunction(log);
    await svc.refreshAll(["a", "b"]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Cannot refresh a - not in VS Code context"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Cannot refresh b - not in VS Code context"));
  });

  it("getLastUpdated returns a Date instance", () => {
    const org = "dateinst";
    const iso = "2025-06-01T00:00:00.000Z";
    fs.writeFileSync(
      path.join(cacheDir, `github-${org}.json`),
      JSON.stringify({ org, collections: [], lastUpdated: iso }),
      "utf-8",
    );
    const svc = GitHubCollectionCache.getInstance();
    svc.loadFromDisk(org);
    const d = svc.getLastUpdated(org);
    expect(d).toBeInstanceOf(Date);
  });

  it("_parseGalaxyYml handles array description and returns null without namespace", () => {
    const svc = GitHubCollectionCache.getInstance();
    const yaml = `name: onlyname
version: 1
description:
  - line one
  - line two
`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((svc as any)._parseGalaxyYml(yaml, "o/r", "o")).toBeNull();
    const yaml2 = `namespace: ns
name: n
description: [a, b]
`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const col = (svc as any)._parseGalaxyYml(yaml2, "org/repo", "org");
    expect(col?.description).toBe("a b");
  });

  it("_saveToDisk creates cache dir and writes file", () => {
    const svc = GitHubCollectionCache.getInstance();
    const cache = {
      org: "saveorg",
      collections: [
        {
          namespace: "s",
          name: "c",
          version: "1.0.0",
          description: "",
          repository: "s/c",
          org: "saveorg",
          htmlUrl: "https://github.com/s/c",
          installUrl: "git+https://github.com/s/c.git",
        },
      ],
      lastUpdated: new Date().toISOString(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any)._saveToDisk("saveorg", cache);
    const written = JSON.parse(fs.readFileSync(path.join(cacheDir, "github-saveorg.json"), "utf-8"));
    expect(written.collections).toHaveLength(1);
  });

  it("_saveToDisk handles write errors gracefully", () => {
    const log = vi.fn();
    const svc = GitHubCollectionCache.getInstance();
    svc.setLogFunction(log);
    try {
      fs.chmodSync(cacheDir, 0o555);
      const cache = { org: "err", collections: [], lastUpdated: new Date().toISOString() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (svc as any)._saveToDisk("err", cache);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("Error saving cache"));
    } finally {
      fs.chmodSync(cacheDir, 0o755);
    }
  });

  it("_formatAge returns singular forms for 1 minute and 1 hour", () => {
    const svc = GitHubCollectionCache.getInstance();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fmt = (svc as any)._formatAge.bind(svc) as (ms: number) => string;
    expect(fmt(60 * 1000)).toBe("1 minute ago");
    expect(fmt(60 * 60 * 1000)).toBe("1 hour ago");
    expect(fmt(24 * 60 * 60 * 1000)).toBe("1 day ago");
  });

  it("_parseGalaxyYml returns null for non-object YAML", () => {
    const svc = GitHubCollectionCache.getInstance();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((svc as any)._parseGalaxyYml("just a string", "o/r", "o")).toBeNull();
  });

  it("_parseGalaxyYml returns null for invalid YAML", () => {
    const log = vi.fn();
    const svc = GitHubCollectionCache.getInstance();
    svc.setLogFunction(log);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((svc as any)._parseGalaxyYml("{{invalid: yaml: [", "o/r", "o")).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Failed to parse galaxy.yml"));
  });

  it("_parseGalaxyYml uses 0.0.0 when version is missing", () => {
    const svc = GitHubCollectionCache.getInstance();
    const yml = "namespace: ns\nname: nm\ndescription: test\n";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const col = (svc as any)._parseGalaxyYml(yml, "o/r", "o");
    expect(col.version).toBe("0.0.0");
  });

  it("_parseGalaxyYml handles empty description", () => {
    const svc = GitHubCollectionCache.getInstance();
    const yml = "namespace: ns\nname: nm\nversion: 1.0.0\n";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const col = (svc as any)._parseGalaxyYml(yml, "o/r", "o");
    expect(col.description).toBe("");
  });

  it("_scanOrg uses code search API and fetches metadata", async () => {
    const svc = GitHubCollectionCache.getInstance();
    const searchResponse = {
      items: [{ repository: { full_name: "org/repo1", html_url: "https://github.com/org/repo1" } }],
    };
    const galaxyYml =
      "namespace: testns\nname: testcol\nversion: 2.0.0\ndescription: A test\n";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => searchResponse })
      .mockResolvedValueOnce({ ok: true, text: async () => galaxyYml });
    vi.stubGlobal("fetch", fetchMock);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (svc as any)._scanOrg("org", "fake-token");
    expect(result).toHaveLength(1);
    expect(result[0].namespace).toBe("testns");
    expect(result[0].name).toBe("testcol");

    vi.unstubAllGlobals();
  });

  it("_scanOrg falls back to repo scan when code search fails", async () => {
    const svc = GitHubCollectionCache.getInstance();
    const log = vi.fn();
    svc.setLogFunction(log);

    const galaxyYml = "namespace: fb\nname: col\nversion: 1.0.0\ndescription: fallback\n";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ full_name: "org/repo", html_url: "h" }] })
      .mockResolvedValueOnce({ ok: true, text: async () => galaxyYml });
    vi.stubGlobal("fetch", fetchMock);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (svc as any)._scanOrg("org", "token");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("falling back to repo scan"));
    expect(result).toHaveLength(1);

    vi.unstubAllGlobals();
  });

  it("_scanOrg returns empty when no galaxy.yml files found", async () => {
    const svc = GitHubCollectionCache.getInstance();
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (svc as any)._scanOrg("emptyorg", "token");
    expect(result).toEqual([]);

    vi.unstubAllGlobals();
  });

  it("_scanOrg handles fetch errors gracefully", async () => {
    const svc = GitHubCollectionCache.getInstance();
    const log = vi.fn();
    svc.setLogFunction(log);
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (svc as any)._scanOrg("errorg", "token");
    expect(result).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Error scanning errorg"));

    vi.unstubAllGlobals();
  });

  it("_scanOrgRepos paginates and stops when page is short", async () => {
    const svc = GitHubCollectionCache.getInstance();
    const galaxyYml = "namespace: pg\nname: col\nversion: 1.0.0\ndescription: page\n";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ full_name: "org/r1", html_url: "h" }] })
      .mockResolvedValueOnce({ ok: true, text: async () => galaxyYml });
    vi.stubGlobal("fetch", fetchMock);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (svc as any)._scanOrgRepos("org", "token");
    expect(result).toHaveLength(1);

    vi.unstubAllGlobals();
  });

  it("_scanOrgRepos stops on non-ok response", async () => {
    const svc = GitHubCollectionCache.getInstance();
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (svc as any)._scanOrgRepos("org", "token");
    expect(result).toEqual([]);

    vi.unstubAllGlobals();
  });

  it("_scanOrgRepos skips repos without galaxy.yml", async () => {
    const svc = GitHubCollectionCache.getInstance();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ full_name: "org/nope", html_url: "h" }] })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (svc as any)._scanOrgRepos("org", "token");
    expect(result).toEqual([]);

    vi.unstubAllGlobals();
  });

  it("_fetchCollectionMetadata tries galaxy.yml then galaxy.yaml with main and HEAD branches", async () => {
    const svc = GitHubCollectionCache.getInstance();
    const galaxyYaml = "namespace: ns\nname: nm\nversion: 3.0.0\ndescription: found\n";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, text: async () => galaxyYaml });
    vi.stubGlobal("fetch", fetchMock);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (svc as any)._fetchCollectionMetadata("org/repo", "token", "org");
    expect(result).not.toBeNull();
    expect(result.version).toBe("3.0.0");
    expect(fetchMock).toHaveBeenCalledTimes(4);

    vi.unstubAllGlobals();
  });

  it("_fetchCollectionMetadata returns null when no file found", async () => {
    const svc = GitHubCollectionCache.getInstance();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (svc as any)._fetchCollectionMetadata("org/repo", "token", "org");
    expect(result).toBeNull();

    vi.unstubAllGlobals();
  });
});
