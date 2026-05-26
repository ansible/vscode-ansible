import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

const httpsGetMock = vi.hoisted(() => vi.fn());

vi.mock("https", () => ({
  get: httpsGetMock,
}));

import { GalaxyCollectionCache } from "../../src/services/GalaxyCollectionCache";

function resetGalaxySingleton(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (GalaxyCollectionCache as any)._instance = undefined;
}

function installMockGalaxyResponse(body: object): void {
  httpsGetMock.mockImplementation((_url: unknown, _options: unknown, cb: (res: EventEmitter) => void) => {
    const res = new EventEmitter() as EventEmitter & { statusCode: number };
    res.statusCode = 200;

    const req = new EventEmitter() as EventEmitter & { destroy: () => void };
    req.destroy = vi.fn();

    queueMicrotask(() => {
      cb(res);
      queueMicrotask(() => {
        res.emit("data", Buffer.from(JSON.stringify(body), "utf8"));
        res.emit("end");
      });
    });

    return req as ReturnType<typeof import("https").get>;
  });
}

function installMockGalaxySequence(
  responses: Array<{ statusCode: number; body: string }>,
): void {
  let index = 0;
  httpsGetMock.mockImplementation((_url: unknown, _options: unknown, cb: (res: EventEmitter) => void) => {
    const spec = responses[Math.min(index, responses.length - 1)];
    if (index < responses.length) {
      index += 1;
    }
    const res = new EventEmitter() as EventEmitter & { statusCode: number };
    res.statusCode = spec.statusCode;

    const req = new EventEmitter() as EventEmitter & { destroy: () => void };
    req.destroy = vi.fn();

    queueMicrotask(() => {
      cb(res);
      queueMicrotask(() => {
        res.emit("data", Buffer.from(spec.body, "utf8"));
        res.emit("end");
      });
    });

    return req as ReturnType<typeof import("https").get>;
  });
}

describe("GalaxyCollectionCache", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ansible-galaxy-cache-"));
    resetGalaxySingleton();
    httpsGetMock.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    resetGalaxySingleton();
    httpsGetMock.mockReset();
  });

  it("getInstance returns the same singleton", () => {
    const a = GalaxyCollectionCache.getInstance();
    const b = GalaxyCollectionCache.getInstance();
    expect(a).toBe(b);
  });

  it("loads collections from disk when cache is fresh (TTL respected)", async () => {
    const storage = path.join(tmpDir, "globalStorage");
    fs.mkdirSync(storage, { recursive: true });

    const cache = {
      timestamp: Date.now(),
      collections: [
        {
          namespace: "community",
          name: "docker",
          version: "3.0.0",
          deprecated: false,
          downloadCount: 42,
        },
      ],
    };
    fs.writeFileSync(path.join(storage, "galaxy-collections-cache.json"), JSON.stringify(cache), "utf8");

    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });

    await svc.ensureLoaded();

    expect(httpsGetMock).not.toHaveBeenCalled();
    expect(svc.isLoaded()).toBe(true);
    const list = svc.getCollections();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      namespace: "community",
      name: "docker",
      version: "3.0.0",
      downloadCount: 42,
    });
  });

  it("ignores expired file cache and fetches from the API", async () => {
    const storage = path.join(tmpDir, "globalStorage2");
    fs.mkdirSync(storage, { recursive: true });

    const staleMs = 8 * 24 * 60 * 60 * 1000;
    const cache = {
      timestamp: Date.now() - staleMs,
      collections: [{ namespace: "old", name: "stale", version: "1", deprecated: false, downloadCount: 1 }],
    };
    fs.writeFileSync(path.join(storage, "galaxy-collections-cache.json"), JSON.stringify(cache), "utf8");

    const apiBody = {
      meta: { count: 1 },
      links: { next: null as string | null },
      data: [
        {
          namespace: "new",
          name: "fresh",
          deprecated: false,
          download_count: 9,
          highest_version: { version: "2.0.0" },
        },
      ],
    };
    installMockGalaxyResponse(apiBody);

    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });

    await svc.ensureLoaded();

    expect(httpsGetMock).toHaveBeenCalled();
    expect(svc.getCollections().some((c) => c.name === "fresh")).toBe(true);
  });

  it("search filters by name, namespace, and fqcn; empty query returns top 100", async () => {
    const storage = path.join(tmpDir, "globalStorage3");
    fs.mkdirSync(storage, { recursive: true });

    const collections = Array.from({ length: 120 }, (_, i) => ({
      namespace: "ns",
      name: `coll${i}`,
      version: "1.0.0",
      deprecated: false,
      downloadCount: 200 - i,
    }));

    fs.writeFileSync(
      path.join(storage, "galaxy-collections-cache.json"),
      JSON.stringify({ timestamp: Date.now(), collections }),
      "utf8",
    );

    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });
    await svc.ensureLoaded();

    const top = svc.search("");
    expect(top).toHaveLength(100);
    expect(top[0].downloadCount).toBeGreaterThanOrEqual(top[99].downloadCount);

    const filtered = svc.search("coll5");
    expect(filtered.every((c) => c.name.includes("coll5") || `${c.namespace}.${c.name}`.includes("coll5"))).toBe(
      true,
    );

    const byNs = svc.search("ns");
    expect(byNs.length).toBeGreaterThan(0);
  });

  it("forceRefresh clears state and repopulates from mocked HTTP", async () => {
    const storage = path.join(tmpDir, "globalStorage4");
    fs.mkdirSync(storage, { recursive: true });

    const apiBody = {
      meta: { count: 2 },
      links: { next: null as string | null },
      data: [
        {
          namespace: "a",
          name: "b",
          deprecated: false,
          download_count: 3,
          highest_version: { version: "1.2.3" },
        },
      ],
    };
    installMockGalaxyResponse(apiBody);

    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });

    await svc.forceRefresh();

    expect(svc.isLoaded()).toBe(true);
    expect(svc.getCollections()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          namespace: "a",
          name: "b",
          version: "1.2.3",
          downloadCount: 3,
        }),
      ]),
    );

    const written = fs.readFileSync(path.join(storage, "galaxy-collections-cache.json"), "utf8");
    const parsed = JSON.parse(written) as { timestamp: number; collections: unknown[] };
    expect(parsed.collections).toHaveLength(1);
    expect(typeof parsed.timestamp).toBe("number");
  });

  it("ensureLoaded is a no-op on second call when already loaded", async () => {
    const storage = path.join(tmpDir, "globalStorage-idem");
    fs.mkdirSync(storage, { recursive: true });
    const cache = {
      timestamp: Date.now(),
      collections: [{ namespace: "a", name: "b", version: "1", deprecated: false, downloadCount: 1 }],
    };
    fs.writeFileSync(path.join(storage, "galaxy-collections-cache.json"), JSON.stringify(cache), "utf8");

    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });

    await svc.ensureLoaded();
    await svc.ensureLoaded();
    expect(httpsGetMock).not.toHaveBeenCalled();
    expect(svc.getCollections()).toHaveLength(1);
  });

  it("getCacheAge returns never before load and hour/day strings after API fetch", async () => {
    resetGalaxySingleton();
    const storage = path.join(tmpDir, "globalStorage-age");
    fs.mkdirSync(storage, { recursive: true });

    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });
    expect(svc.getCacheAge()).toBe("never");

    installMockGalaxyResponse({
      meta: { count: 1 },
      links: { next: null as string | null },
      data: [
        {
          namespace: "n",
          name: "c",
          deprecated: false,
          download_count: 1,
          highest_version: { version: "1.0.0" },
        },
      ],
    });

    await svc.forceRefresh();
    expect(svc.getCacheAge()).toMatch(/just now|hour|day/);
  });

  it("fetches multiple pages when API returns relative next link", async () => {
    const storage = path.join(tmpDir, "globalStorage-pages");
    fs.mkdirSync(storage, { recursive: true });

    const page1 = {
      meta: { count: 200 },
      links: { next: "/api/v3/collections/?page=2" },
      data: [
        {
          namespace: "p1",
          name: "a",
          deprecated: false,
          download_count: 10,
          highest_version: { version: "1.0.0" },
        },
      ],
    };
    const page2 = {
      meta: { count: 200 },
      links: { next: null as string | null },
      data: [
        {
          namespace: "p2",
          name: "b",
          deprecated: false,
          download_count: 20,
          highest_version: { version: "2.0.0" },
        },
      ],
    };

    let call = 0;
    httpsGetMock.mockImplementation((url: unknown, _options: unknown, cb: (res: EventEmitter) => void) => {
      const body = call++ === 0 ? page1 : page2;
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = 200;
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = vi.fn();
      queueMicrotask(() => {
        cb(res);
        queueMicrotask(() => {
          res.emit("data", Buffer.from(JSON.stringify(body), "utf8"));
          res.emit("end");
        });
      });
      return req as ReturnType<typeof import("https").get>;
    });

    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });
    await svc.forceRefresh();

    expect(httpsGetMock).toHaveBeenCalledTimes(2);
    const names = svc.getCollections().map((c) => `${c.namespace}.${c.name}`).sort();
    expect(names).toEqual(["p1.a", "p2.b"]);
  });

  it("retries HTTP 500 then succeeds", async () => {
    const storage = path.join(tmpDir, "globalStorage-retry");
    fs.mkdirSync(storage, { recursive: true });

    const okBody = {
      meta: { count: 1 },
      links: { next: null as string | null },
      data: [
        {
          namespace: "ok",
          name: "ns",
          deprecated: false,
          download_count: 1,
          highest_version: { version: "1.0.0" },
        },
      ],
    };

    installMockGalaxySequence([
      { statusCode: 500, body: "err" },
      { statusCode: 200, body: JSON.stringify(okBody) },
    ]);

    vi.useFakeTimers();
    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });
    const p = svc.forceRefresh();
    await vi.advanceTimersByTimeAsync(2000);
    await p;
    vi.useRealTimers();

    expect(httpsGetMock).toHaveBeenCalledTimes(2);
    expect(svc.getCollections().some((c) => c.name === "ns")).toBe(true);
  });

  it("getProgress and onDidUpdateProgress fire during fetch", async () => {
    const storage = path.join(tmpDir, "globalStorage-prog");
    fs.mkdirSync(storage, { recursive: true });

    const body = {
      meta: { count: 1 },
      links: { next: null as string | null },
      data: [
        {
          namespace: "x",
          name: "y",
          deprecated: false,
          download_count: 5,
          highest_version: { version: "1.0.0" },
        },
      ],
    };
    installMockGalaxyResponse(body);

    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });

    const progress: Array<{ loaded: number; total: number }> = [];
    const sub = svc.onDidUpdateProgress((e: { loaded: number; total: number }) => progress.push(e));

    await svc.forceRefresh();
    sub.dispose?.();

    expect(progress.length).toBeGreaterThan(0);
    expect(svc.getProgress().loaded).toBeGreaterThan(0);
  });

  it("ignores invalid on-disk cache shape and fetches from API", async () => {
    const storage = path.join(tmpDir, "globalStorage-bad");
    fs.mkdirSync(storage, { recursive: true });
    fs.writeFileSync(path.join(storage, "galaxy-collections-cache.json"), '{"timestamp":1}', "utf8");

    installMockGalaxyResponse({
      meta: { count: 1 },
      links: { next: null },
      data: [
        {
          namespace: "fresh",
          name: "api",
          deprecated: false,
          download_count: 1,
          highest_version: { version: "1.0.0" },
        },
      ],
    });

    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });
    await svc.ensureLoaded();

    expect(httpsGetMock).toHaveBeenCalled();
    expect(svc.getCollections().some((c) => c.namespace === "fresh")).toBe(true);
  });

  it("startBackgroundLoad kicks off fetch without awaiting", async () => {
    const storage = path.join(tmpDir, "globalStorage-bg");
    fs.mkdirSync(storage, { recursive: true });

    let released!: () => void;
    const gate = new Promise<void>((r) => {
      released = r;
    });

    httpsGetMock.mockImplementation((_url: unknown, _options: unknown, cb: (res: EventEmitter) => void) => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = 200;
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = vi.fn();
      void gate.then(() => {
        queueMicrotask(() => {
          cb(res);
          queueMicrotask(() => {
            res.emit(
              "data",
              Buffer.from(
                JSON.stringify({
                  meta: { count: 1 },
                  links: { next: null },
                  data: [
                    {
                      namespace: "bg",
                      name: "c",
                      deprecated: false,
                      download_count: 1,
                      highest_version: { version: "1.0.0" },
                    },
                  ],
                }),
                "utf8",
              ),
            );
            res.emit("end");
          });
        });
      });
      return req as ReturnType<typeof import("https").get>;
    });

    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });
    svc.startBackgroundLoad();
    await vi.waitUntil(() => svc.isLoading() || svc.isLoaded(), { timeout: 2000 });
    released();
    await vi.waitUntil(() => svc.isLoaded(), { timeout: 3000 });
    expect(svc.getCollections().some((c) => c.name === "c")).toBe(true);
  });

  it("_loadFromFileCache returns false when cacheFilePath is undefined", async () => {
    const svc = GalaxyCollectionCache.getInstance();
    const spy = vi.spyOn(GalaxyCollectionCache.prototype as unknown as { _cacheFilePath: string | undefined }, "_cacheFilePath", "get").mockReturnValue(undefined);
    const result = await (svc as unknown as { _loadFromFileCache: () => Promise<boolean> })._loadFromFileCache();
    spy.mockRestore();
    expect(result).toBe(false);
  });

  it("_loadFromFileCache returns false for corrupted JSON", async () => {
    const storage = path.join(tmpDir, "gs-corrupt");
    fs.mkdirSync(storage, { recursive: true });
    fs.writeFileSync(path.join(storage, "galaxy-collections-cache.json"), "not json", "utf8");
    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });
    const result = await (svc as unknown as { _loadFromFileCache: () => Promise<boolean> })._loadFromFileCache();
    expect(result).toBe(false);
  });

  it("_saveToFileCache does nothing when cacheFilePath is undefined", async () => {
    const svc = GalaxyCollectionCache.getInstance();
    const spy = vi.spyOn(GalaxyCollectionCache.prototype as unknown as { _cacheFilePath: string | undefined }, "_cacheFilePath", "get").mockReturnValue(undefined);
    await (svc as unknown as { _saveToFileCache: () => Promise<void> })._saveToFileCache();
    spy.mockRestore();
    expect(svc.isLoaded()).toBe(false);
  });

  it("_saveToFileCache handles write errors gracefully", async () => {
    const storage = path.join(tmpDir, "gs-writeerr");
    fs.mkdirSync(storage, { recursive: true });
    fs.chmodSync(storage, 0o555);
    try {
      const svc = GalaxyCollectionCache.getInstance();
      svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });
      await (svc as unknown as { _saveToFileCache: () => Promise<void> })._saveToFileCache();
    } finally {
      fs.chmodSync(storage, 0o755);
    }
  });

  it("_saveToFileCache creates directory if missing", async () => {
    const storage = path.join(tmpDir, "gs-newdir", "nested");
    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });
    await (svc as unknown as { _saveToFileCache: () => Promise<void> })._saveToFileCache();
    expect(fs.existsSync(path.join(storage, "galaxy-collections-cache.json"))).toBe(true);
  });

  it("_loadCollections skips API when already loaded and not force refresh", async () => {
    const storage = path.join(tmpDir, "gs-skip");
    fs.mkdirSync(storage, { recursive: true });
    const cache = {
      timestamp: Date.now(),
      collections: [{ namespace: "a", name: "b", version: "1", deprecated: false, downloadCount: 1 }],
    };
    fs.writeFileSync(path.join(storage, "galaxy-collections-cache.json"), JSON.stringify(cache), "utf8");
    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });
    await svc.ensureLoaded();
    await (svc as unknown as { _loadCollections: (force: boolean) => Promise<void> })._loadCollections(false);
    expect(httpsGetMock).not.toHaveBeenCalled();
  });

  it("getCacheAge returns singular day form", async () => {
    const svc = GalaxyCollectionCache.getInstance();
    (svc as unknown as { _cacheTimestamp: number })._cacheTimestamp = Date.now() - 25 * 60 * 60 * 1000;
    expect(svc.getCacheAge()).toBe("1 day ago");
  });

  it("getCacheAge returns singular hour form", async () => {
    const svc = GalaxyCollectionCache.getInstance();
    (svc as unknown as { _cacheTimestamp: number })._cacheTimestamp = Date.now() - 90 * 60 * 1000;
    expect(svc.getCacheAge()).toBe("1 hour ago");
  });

  it("handles API response with absolute next URL", async () => {
    const storage = path.join(tmpDir, "gs-abs");
    fs.mkdirSync(storage, { recursive: true });

    let call = 0;
    httpsGetMock.mockImplementation((_url: unknown, _options: unknown, cb: (res: EventEmitter) => void) => {
      const body =
        call++ === 0
          ? {
              meta: { count: 2 },
              links: { next: "https://galaxy.ansible.com/api/v3/collections/?page=2" },
              data: [
                {
                  namespace: "p1",
                  name: "a",
                  deprecated: false,
                  download_count: 10,
                  highest_version: { version: "1.0.0" },
                },
              ],
            }
          : {
              meta: { count: 2 },
              links: { next: null },
              data: [
                {
                  namespace: "p2",
                  name: "b",
                  deprecated: false,
                  download_count: 5,
                  highest_version: { version: "2.0.0" },
                },
              ],
            };
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = 200;
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = vi.fn();
      queueMicrotask(() => {
        cb(res);
        queueMicrotask(() => {
          res.emit("data", Buffer.from(JSON.stringify(body), "utf8"));
          res.emit("end");
        });
      });
      return req as ReturnType<typeof import("https").get>;
    });

    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });
    await svc.forceRefresh();
    expect(svc.getCollections()).toHaveLength(2);
  });

  it("handles API response with missing highest_version and download_count", async () => {
    const storage = path.join(tmpDir, "gs-missing");
    fs.mkdirSync(storage, { recursive: true });
    installMockGalaxyResponse({
      meta: { count: 1 },
      links: { next: null },
      data: [
        {
          namespace: "x",
          name: "y",
          deprecated: false,
          download_count: undefined as unknown as number,
          highest_version: undefined as unknown as { version: string },
        },
      ],
    });
    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });
    await svc.forceRefresh();
    const col = svc.getCollections()[0];
    expect(col.version).toBe("");
    expect(col.downloadCount).toBe(0);
  });

  it("_fetchPage handles request timeout", async () => {
    const svc = GalaxyCollectionCache.getInstance();
    httpsGetMock.mockImplementation((_url: unknown, _options: unknown, _cb: unknown) => {
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = vi.fn();
      queueMicrotask(() => req.emit("timeout"));
      return req as ReturnType<typeof import("https").get>;
    });
    const p = (svc as unknown as { _fetchPage: (u: string, r?: number) => Promise<unknown> })._fetchPage("https://example.com", 1);
    await expect(p).rejects.toThrow(/timed out/);
  });

  it("_fetchPage handles request error", async () => {
    const svc = GalaxyCollectionCache.getInstance();
    httpsGetMock.mockImplementation((_url: unknown, _options: unknown, _cb: unknown) => {
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = vi.fn();
      queueMicrotask(() => req.emit("error", new Error("ECONNREFUSED")));
      return req as ReturnType<typeof import("https").get>;
    });
    const p = (svc as unknown as { _fetchPage: (u: string, r?: number) => Promise<unknown> })._fetchPage("https://example.com", 1);
    await expect(p).rejects.toThrow(/Network error/);
  });

  it("_fetchPage handles empty response body", async () => {
    const svc = GalaxyCollectionCache.getInstance();
    httpsGetMock.mockImplementation((_url: unknown, _options: unknown, cb: (res: EventEmitter) => void) => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = 200;
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = vi.fn();
      queueMicrotask(() => {
        cb(res);
        queueMicrotask(() => {
          res.emit("data", Buffer.from("", "utf8"));
          res.emit("end");
        });
      });
      return req as ReturnType<typeof import("https").get>;
    });
    const p = (svc as unknown as { _fetchPage: (u: string, r?: number) => Promise<unknown> })._fetchPage("https://example.com", 1);
    await expect(p).rejects.toThrow(/Empty response/);
  });

  it("_fetchPage follows redirects with relative URL", async () => {
    const svc = GalaxyCollectionCache.getInstance();
    let call = 0;
    httpsGetMock.mockImplementation((_url: unknown, _options: unknown, cb: (res: EventEmitter) => void) => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> };
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = vi.fn();
      if (call++ === 0) {
        res.statusCode = 301;
        res.headers = { location: "/api/v3/collections/?page=2" };
        queueMicrotask(() => cb(res));
      } else {
        res.statusCode = 200;
        res.headers = {};
        queueMicrotask(() => {
          cb(res);
          queueMicrotask(() => {
            res.emit(
              "data",
              Buffer.from(
                JSON.stringify({
                  meta: { count: 1 },
                  links: { next: null },
                  data: [
                    {
                      namespace: "r",
                      name: "d",
                      deprecated: false,
                      download_count: 1,
                      highest_version: { version: "1.0.0" },
                    },
                  ],
                }),
                "utf8",
              ),
            );
            res.emit("end");
          });
        });
      }
      return req as ReturnType<typeof import("https").get>;
    });
    const result = await (svc as unknown as { _fetchPage: (u: string, r?: number) => Promise<{ data: unknown[] }> })._fetchPage(
      "https://galaxy.ansible.com/api",
      3,
    );
    expect(result.data).toHaveLength(1);
  });

  it("_fetchPage retries on response stream error then succeeds", async () => {
    const svc = GalaxyCollectionCache.getInstance();
    let call = 0;
    httpsGetMock.mockImplementation((_url: unknown, _options: unknown, cb: (res: EventEmitter) => void) => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> };
      res.statusCode = 200;
      res.headers = {};
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = vi.fn();
      if (call++ === 0) {
        queueMicrotask(() => {
          cb(res);
          queueMicrotask(() => res.emit("error", new Error("stream broken")));
        });
      } else {
        queueMicrotask(() => {
          cb(res);
          queueMicrotask(() => {
            res.emit("data", Buffer.from(JSON.stringify({
              meta: { count: 1 }, links: { next: null },
              data: [{ namespace: "s", name: "e", deprecated: false, download_count: 1, highest_version: { version: "1.0.0" } }],
            }), "utf8"));
            res.emit("end");
          });
        });
      }
      return req as ReturnType<typeof import("https").get>;
    });
    vi.useFakeTimers();
    const p = (svc as unknown as { _fetchPage: (u: string, r?: number) => Promise<{ data: unknown[] }> })._fetchPage("https://example.com", 2);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await p;
    vi.useRealTimers();
    expect(result.data).toHaveLength(1);
  });

  it("_fetchPage retries on parse error then succeeds", async () => {
    const svc = GalaxyCollectionCache.getInstance();
    let call = 0;
    httpsGetMock.mockImplementation((_url: unknown, _options: unknown, cb: (res: EventEmitter) => void) => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = 200;
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = vi.fn();
      queueMicrotask(() => {
        cb(res);
        queueMicrotask(() => {
          const body = call++ === 0
            ? "not json"
            : JSON.stringify({ meta: { count: 1 }, links: { next: null }, data: [{ namespace: "p", name: "e", deprecated: false, download_count: 1, highest_version: { version: "1.0.0" } }] });
          res.emit("data", Buffer.from(body, "utf8"));
          res.emit("end");
        });
      });
      return req as ReturnType<typeof import("https").get>;
    });
    vi.useFakeTimers();
    const p = (svc as unknown as { _fetchPage: (u: string, r?: number) => Promise<{ data: unknown[] }> })._fetchPage("https://example.com", 2);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await p;
    vi.useRealTimers();
    expect(result.data).toHaveLength(1);
  });

  it("_fetchPage retries on empty body then succeeds", async () => {
    const svc = GalaxyCollectionCache.getInstance();
    let call = 0;
    httpsGetMock.mockImplementation((_url: unknown, _options: unknown, cb: (res: EventEmitter) => void) => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = 200;
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = vi.fn();
      queueMicrotask(() => {
        cb(res);
        queueMicrotask(() => {
          const body = call++ === 0
            ? ""
            : JSON.stringify({ meta: { count: 1 }, links: { next: null }, data: [{ namespace: "e", name: "b", deprecated: false, download_count: 1, highest_version: { version: "1.0.0" } }] });
          res.emit("data", Buffer.from(body, "utf8"));
          res.emit("end");
        });
      });
      return req as ReturnType<typeof import("https").get>;
    });
    vi.useFakeTimers();
    const p = (svc as unknown as { _fetchPage: (u: string, r?: number) => Promise<{ data: unknown[] }> })._fetchPage("https://example.com", 2);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await p;
    vi.useRealTimers();
    expect(result.data).toHaveLength(1);
  });

  it("_fetchPage retries on request error then succeeds", async () => {
    const svc = GalaxyCollectionCache.getInstance();
    let call = 0;
    httpsGetMock.mockImplementation((_url: unknown, _options: unknown, cb: (res: EventEmitter) => void) => {
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = vi.fn();
      if (call++ === 0) {
        queueMicrotask(() => req.emit("error", new Error("ECONNRESET")));
      } else {
        const res = new EventEmitter() as EventEmitter & { statusCode: number };
        res.statusCode = 200;
        queueMicrotask(() => {
          cb(res);
          queueMicrotask(() => {
            res.emit("data", Buffer.from(JSON.stringify({
              meta: { count: 1 }, links: { next: null },
              data: [{ namespace: "r", name: "e", deprecated: false, download_count: 1, highest_version: { version: "1.0.0" } }],
            }), "utf8"));
            res.emit("end");
          });
        });
      }
      return req as ReturnType<typeof import("https").get>;
    });
    vi.useFakeTimers();
    const p = (svc as unknown as { _fetchPage: (u: string, r?: number) => Promise<{ data: unknown[] }> })._fetchPage("https://example.com", 2);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await p;
    vi.useRealTimers();
    expect(result.data).toHaveLength(1);
  });

  it("_fetchPage retries on timeout then succeeds", async () => {
    const svc = GalaxyCollectionCache.getInstance();
    let call = 0;
    httpsGetMock.mockImplementation((_url: unknown, _options: unknown, cb: (res: EventEmitter) => void) => {
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = vi.fn();
      if (call++ === 0) {
        queueMicrotask(() => req.emit("timeout"));
      } else {
        const res = new EventEmitter() as EventEmitter & { statusCode: number };
        res.statusCode = 200;
        queueMicrotask(() => {
          cb(res);
          queueMicrotask(() => {
            res.emit("data", Buffer.from(JSON.stringify({
              meta: { count: 1 }, links: { next: null },
              data: [{ namespace: "t", name: "o", deprecated: false, download_count: 1, highest_version: { version: "1.0.0" } }],
            }), "utf8"));
            res.emit("end");
          });
        });
      }
      return req as ReturnType<typeof import("https").get>;
    });
    vi.useFakeTimers();
    const p = (svc as unknown as { _fetchPage: (u: string, r?: number) => Promise<{ data: unknown[] }> })._fetchPage("https://example.com", 2);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await p;
    vi.useRealTimers();
    expect(result.data).toHaveLength(1);
  });

  it("_loadCollections catches fetch errors and logs them (standalone mode)", async () => {
    const storage = path.join(tmpDir, "gs-fetcherr");
    fs.mkdirSync(storage, { recursive: true });

    httpsGetMock.mockImplementation((_url: unknown, _options: unknown, _cb: unknown) => {
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = vi.fn();
      queueMicrotask(() => req.emit("error", new Error("DNS_FAIL")));
      return req as ReturnType<typeof import("https").get>;
    });

    vi.useFakeTimers();
    const svc = GalaxyCollectionCache.getInstance();
    svc.setExtensionContext({ globalStorageUri: { fsPath: storage } });
    const p = svc.forceRefresh();
    await vi.advanceTimersByTimeAsync(10000);
    await p;
    vi.useRealTimers();

    expect(svc.isLoaded()).toBe(false);
    expect(svc.isLoading()).toBe(false);
  });

  it("_cacheFilePath returns fallback path in standalone mode", () => {
    const svc = GalaxyCollectionCache.getInstance();
    const cachePath = (svc as unknown as { _cacheFilePath: string | undefined })._cacheFilePath;
    expect(cachePath).toBeDefined();
    expect(cachePath!).toContain("galaxy-collections-cache.json");
  });

  it("_fetchPage handles HTTP 400+ final failure after exhausting retries", async () => {
    const svc = GalaxyCollectionCache.getInstance();
    httpsGetMock.mockImplementation((_url: unknown, _options: unknown, cb: (res: EventEmitter) => void) => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number; statusMessage: string };
      res.statusCode = 503;
      res.statusMessage = "Service Unavailable";
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = vi.fn();
      queueMicrotask(() => cb(res));
      return req as ReturnType<typeof import("https").get>;
    });
    const p = (svc as unknown as { _fetchPage: (u: string, r?: number) => Promise<unknown> })._fetchPage("https://example.com", 1);
    await expect(p).rejects.toThrow(/HTTP 503/);
  });
});
