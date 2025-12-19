import { skipEE, deleteAlsCache } from "./helper";

export const mochaHooks = (): Mocha.RootHookObject => {
  return {
    beforeAll(this: Mocha.Context) {
      deleteAlsCache();
    },
    beforeEach(this: Mocha.Context) {
      if (skipEE() && this.currentTest?.fullTitle().includes("@ee")) {
        console.warn(
          `Skipped test due to environment conditions: ${this.currentTest.title}`,
        );
        this.skip();
      }
    },
  };
};
