import * as chai from "chai";
import { ConsoleOutput } from "./consoleOutput";

chai.config.truncateThreshold = 0; // disable truncating

export const mochaHooks = (): Mocha.RootHookObject => {
  const consoleOutput = new ConsoleOutput();

  return {
    beforeEach() {
      consoleOutput.capture();
    },

    afterEach(this: Mocha.Context) {
      console.log(this.currentTest?.title);
    },
  };
};
