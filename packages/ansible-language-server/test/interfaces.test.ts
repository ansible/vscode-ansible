import { IPullPolicy } from "../src/interfaces/extensionSettings";

describe("interfaces", function () {
  describe("IPullPolicy", function () {
    it("should exist as a type", function () {
      // Type existence is verified by TypeScript at compile time.
      // If IPullPolicy doesn't exist, this file won't compile.
      const _test: IPullPolicy = "always";
      // Suppress unused variable warning
      void _test;
    });
  });
});
