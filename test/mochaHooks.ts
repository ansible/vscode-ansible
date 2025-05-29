import * as chai from "chai";
import { ConsoleOutput } from "../packages/ansible-language-server/test/consoleOutput";

chai.config.truncateThreshold = 0; // disable truncating

export const mochaHooks = (): Mocha.RootHookObject => {
  const consoleOutput = new ConsoleOutput();

  return {
    beforeEach(this: Mocha.Context) {
      consoleOutput.capture();
    },

    afterEach(this: Mocha.Context) {
      if (this.currentTest?.state !== "passed") {
        consoleOutput.release();
      }
    },
  };
};
