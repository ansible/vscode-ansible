import { describe, it, expect } from "vitest";
// Resolve without .mts so we are not type-checked by tsc -b (which uses moduleResolution node).
// Vitest loads the built config at runtime.
import viteConfig from "@root/vite.config";

describe("vite.config.mts", () => {
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
