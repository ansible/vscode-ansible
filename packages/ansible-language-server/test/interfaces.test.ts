import { IPullPolicy } from "@src/interfaces/extensionSettings.js";
import { expect, expectTypeOf } from "vitest";

describe("interfaces", function () {
  describe("IPullPolicy", function () {
    it("should exist as a type", function () {
      // Type existence is verified by TypeScript at compile time.
      // If IPullPolicy doesn't exist, this file won't compile.
      expectTypeOf<IPullPolicy>().toEqualTypeOf<
        "always" | "missing" | "never" | "tag"
      >();
      const policies: IPullPolicy[] = ["always", "missing", "never", "tag"];
      expect(policies).toContain("always");
    });
  });
});
