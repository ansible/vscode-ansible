import { describe, it, expect } from "vitest";
import viteConfig from "../../vite.config";

describe("vite.config.ts", () => {
  describe("experimental.renderBuiltUrl", () => {
    const renderBuiltUrl = viteConfig.experimental?.renderBuiltUrl;

    it("should have renderBuiltUrl defined", () => {
      expect(renderBuiltUrl).toBeDefined();
      expect(typeof renderBuiltUrl).toBe("function");
    });

    it("should return { relative: true } for assets/codicon.ttf", () => {
      const result = renderBuiltUrl?.("assets/codicon.ttf", {
        hostId: "html",
        hostType: "html",
        type: "asset",
        ssr: false,
      });
      expect(result).toEqual({ relative: true });
    });

    it("should return { relative: true } for assets/codicon.ttf with hash suffix", () => {
      const result = renderBuiltUrl?.("assets/codicon.ttf?hash=abc123", {
        hostId: "html",
        hostType: "html",
        type: "asset",
        ssr: false,
      });
      expect(result).toEqual({ relative: true });
    });

    it("should return undefined for other asset files", () => {
      const result = renderBuiltUrl?.("assets/other-font.woff2", {
        hostId: "html",
        hostType: "html",
        type: "asset",
        ssr: false,
      });
      expect(result).toBeUndefined();
    });

    it("should return undefined for JavaScript files", () => {
      const result = renderBuiltUrl?.("assets/main.js", {
        hostId: "html",
        hostType: "html",
        type: "asset",
        ssr: false,
      });
      expect(result).toBeUndefined();
    });

    it("should return undefined for CSS files", () => {
      const result = renderBuiltUrl?.("assets/style.css", {
        hostId: "html",
        hostType: "html",
        type: "asset",
        ssr: false,
      });
      expect(result).toBeUndefined();
    });
  });
});
