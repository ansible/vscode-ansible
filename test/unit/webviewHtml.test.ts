import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  findHtmlFile,
  getDevServerUrl,
  resolveDevEntryScript,
  getWebviewHtml,
} from "@src/webviewHtml";
import { ExtensionMode } from "vscode";

describe("findHtmlFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "webview-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds an HTML file at the top level", () => {
    fs.writeFileSync(path.join(tmpDir, "index.html"), "<html></html>");
    expect(findHtmlFile(tmpDir, "index")).toBe(path.join(tmpDir, "index.html"));
  });

  it("finds an HTML file in a subdirectory", () => {
    const subDir = path.join(tmpDir, "lightspeed");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, "explorer.html"), "<html></html>");
    expect(findHtmlFile(tmpDir, "explorer")).toBe(
      path.join(subDir, "explorer.html"),
    );
  });

  it("finds an HTML file in a deeply nested directory", () => {
    const deepDir = path.join(tmpDir, "a", "b", "c");
    fs.mkdirSync(deepDir, { recursive: true });
    fs.writeFileSync(path.join(deepDir, "deep.html"), "<html></html>");
    expect(findHtmlFile(tmpDir, "deep")).toBe(path.join(deepDir, "deep.html"));
  });

  it("throws when the HTML file does not exist", () => {
    expect(() => findHtmlFile(tmpDir, "missing")).toThrow(
      /Webview HTML file not found: missing\.html/,
    );
  });
});

describe("getDevServerUrl", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "webview-test-"));
    fs.mkdirSync(path.join(tmpDir, "out"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns the URL when the marker file contains a valid localhost URL", () => {
    fs.writeFileSync(
      path.join(tmpDir, "out", ".vite-dev-server-url"),
      "http://localhost:5173",
    );
    expect(getDevServerUrl(tmpDir)).toBe("http://localhost:5173");
  });

  it("trims whitespace from the marker file", () => {
    fs.writeFileSync(
      path.join(tmpDir, "out", ".vite-dev-server-url"),
      "  http://localhost:5173\n",
    );
    expect(getDevServerUrl(tmpDir)).toBe("http://localhost:5173");
  });

  it("returns undefined when the marker file does not exist", () => {
    expect(getDevServerUrl(tmpDir)).toBeUndefined();
  });

  it("returns undefined for a non-http protocol", () => {
    fs.writeFileSync(
      path.join(tmpDir, "out", ".vite-dev-server-url"),
      "https://localhost:5173",
    );
    expect(getDevServerUrl(tmpDir)).toBeUndefined();
  });

  it("returns undefined for a non-localhost hostname", () => {
    fs.writeFileSync(
      path.join(tmpDir, "out", ".vite-dev-server-url"),
      "http://example.com:5173",
    );
    expect(getDevServerUrl(tmpDir)).toBeUndefined();
  });

  it("returns undefined when URL has no port", () => {
    fs.writeFileSync(
      path.join(tmpDir, "out", ".vite-dev-server-url"),
      "http://localhost",
    );
    expect(getDevServerUrl(tmpDir)).toBeUndefined();
  });

  it("returns undefined for malformed content", () => {
    fs.writeFileSync(
      path.join(tmpDir, "out", ".vite-dev-server-url"),
      "not-a-url",
    );
    expect(getDevServerUrl(tmpDir)).toBeUndefined();
  });
});

describe("resolveDevEntryScript", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "webview-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns lightspeed path when the lightspeed entry file exists", () => {
    const lsDir = path.join(tmpDir, "webviews", "lightspeed", "src");
    fs.mkdirSync(lsDir, { recursive: true });
    fs.writeFileSync(path.join(lsDir, "explorer.ts"), "");
    expect(resolveDevEntryScript(tmpDir, "explorer")).toBe(
      "webviews/lightspeed/src/explorer.ts",
    );
  });

  it("returns top-level webviews path when no lightspeed entry exists", () => {
    expect(resolveDevEntryScript(tmpDir, "add-plugin")).toBe(
      "webviews/add-plugin.ts",
    );
  });
});

describe("getWebviewHtml", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "webview-test-"));
    fs.mkdirSync(path.join(tmpDir, "out"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeContext(mode: number) {
    return {
      extensionPath: tmpDir,
      extensionUri: { path: tmpDir, fsPath: tmpDir },
      extensionMode: mode,
    };
  }

  function makeWebview() {
    return {
      cspSource: "test-csp-source",
      asWebviewUri: vi.fn((uri: { path: string }) => uri.path),
      onDidReceiveMessage: vi.fn(),
      postMessage: vi.fn(),
      options: {},
    };
  }

  describe("dev mode", () => {
    it("returns dev HTML when in Development mode with a valid marker", () => {
      fs.writeFileSync(
        path.join(tmpDir, "out", ".vite-dev-server-url"),
        "http://localhost:5173",
      );
      const webview = makeWebview();
      const context = makeContext(ExtensionMode.Development);

      const html = getWebviewHtml({
        webview: webview as never,
        context: context as never,
        inputName: "add-plugin",
      });

      expect(html).toContain("http://localhost:5173/@vite/client");
      expect(html).toContain("http://localhost:5173/webviews/add-plugin.ts");
      expect(html).toContain('<div id="app"></div>');
      expect(html).toContain("Content-Security-Policy");
    });

    it("resolves lightspeed entry scripts in dev mode", () => {
      fs.writeFileSync(
        path.join(tmpDir, "out", ".vite-dev-server-url"),
        "http://localhost:5173",
      );
      const lsDir = path.join(tmpDir, "webviews", "lightspeed", "src");
      fs.mkdirSync(lsDir, { recursive: true });
      fs.writeFileSync(path.join(lsDir, "explorer.ts"), "");

      const html = getWebviewHtml({
        webview: makeWebview() as never,
        context: makeContext(ExtensionMode.Development) as never,
        inputName: "explorer",
      });

      expect(html).toContain(
        "http://localhost:5173/webviews/lightspeed/src/explorer.ts",
      );
    });

    it("does not use dev mode when extensionMode is Production", () => {
      fs.writeFileSync(
        path.join(tmpDir, "out", ".vite-dev-server-url"),
        "http://localhost:5173",
      );
      // Create a dist file so production path works
      const distDir = path.join(tmpDir, "dist");
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(
        path.join(distDir, "index.html"),
        '<html><head></head><body><script src="/assets/main.js"></script></body></html>',
      );

      const html = getWebviewHtml({
        webview: makeWebview() as never,
        context: makeContext(ExtensionMode.Production) as never,
      });

      expect(html).not.toContain("localhost:5173");
      expect(html).toContain("Content-Security-Policy");
    });
  });

  describe("production mode", () => {
    it("returns production HTML with CSP, nonces, and rewritten asset paths", () => {
      const distDir = path.join(tmpDir, "dist");
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(
        path.join(distDir, "index.html"),
        `<html><head></head><body><script src="/assets/main.js"></script></body></html>`,
      );

      const webview = makeWebview();
      const context = makeContext(ExtensionMode.Production);

      const html = getWebviewHtml({
        webview: webview as never,
        context: context as never,
      });

      expect(html).toContain("Content-Security-Policy");
      expect(html).toContain("nonce-");
      expect(html).toContain("/assets/main.js");
      expect(html).not.toContain('src="/assets/');
    });

    it("throws when the HTML file is missing", () => {
      const distDir = path.join(tmpDir, "dist");
      fs.mkdirSync(distDir, { recursive: true });

      expect(() =>
        getWebviewHtml({
          webview: makeWebview() as never,
          context: makeContext(ExtensionMode.Production) as never,
          inputName: "nonexistent",
        }),
      ).toThrow(/Webview HTML file not found/);
    });

    it("defaults inputName to 'index'", () => {
      const distDir = path.join(tmpDir, "dist");
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(
        path.join(distDir, "index.html"),
        "<html><head></head><body></body></html>",
      );

      const html = getWebviewHtml({
        webview: makeWebview() as never,
        context: makeContext(ExtensionMode.Production) as never,
      });

      expect(html).toContain("<html>");
    });
  });
});
