import { ConsoleOutput } from "./consoleOutput";

export const mochaHooks = (): Mocha.RootHookObject => {
  const consoleOutput = new ConsoleOutput();

  return {
    beforeEach() {
      consoleOutput.capture();
    },

    afterEach() {
      if (this.currentTest.state !== "passed") {
        consoleOutput.release();
      }
    },
  };
};
