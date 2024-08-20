import * as chai from "chai";
import { ConsoleOutput } from "./consoleOutput";
import { skipEE, console, deleteAlsCache } from "./helper";

chai.config.truncateThreshold = 0; // disable truncating

export const mochaHooks = (): Mocha.RootHookObject => {
  const consoleOutput = new ConsoleOutput();

  return {
    beforeAll(this: Mocha.Context) {
      deleteAlsCache();
    },
    beforeEach(this: Mocha.Context) {
      if (skipEE() && this.currentTest?.fullTitle().includes("@ee")) {
        console.warn(
          `Skipped test due to environment conditions: ${this.currentTest?.title}`,
        );
        this.skip();
      } else {
        consoleOutput.capture();
      }
    },

    afterEach(this: Mocha.Context) {
      if (!(skipEE() && this.currentTest?.fullTitle().includes("@ee"))) {
        if (this.currentTest?.state !== "passed") {
          consoleOutput.release();
        }
      }
    },
    afterAll(this: Mocha.Context) {
      deleteAlsCache();
    },
  };
};
