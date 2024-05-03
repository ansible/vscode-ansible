/**
 * Captures all types of outputs from console.[log, debug, info, warn, error] functions
 * by modifying their abilities and redirects them to suppress and release them appropriately
 */
export class ConsoleOutput {
  private logOutput: string = "";
  private debugOutput: string = "";
  private infoOutput: string = "";
  private warnOutput: string = "";
  private errorOutput: string = "";

  private originalConsoleLog = console.log;
  private originalConsoleDebug = console.debug;
  private originalConsoleInfo = console.info;
  private originalConsoleWarn = console.warn;
  private originalConsoleError = console.error;

  /**
   * Captures the output from console.* functions and suppresses it
   */
  public capture(): void {
    this.logOutput = "";
    console.log = (msg) => {
      this.logOutput += `${msg}\n`;
    };

    this.debugOutput = "";
    console.debug = (msg) => {
      this.debugOutput += `${msg}\n`;
    };

    this.infoOutput = "";
    console.info = (msg) => {
      this.infoOutput += `${msg}\n`;
    };

    this.warnOutput = "";
    console.warn = (msg) => {
      this.warnOutput += `${msg}\n`;
    };

    this.errorOutput = "";
    console.error = (msg) => {
      this.errorOutput += `${msg}\n`;
    };
  }

  /**
   * Reverts back the original ability of console.* functions and releases the captured output
   */
  public release(): void {
    console.log = this.originalConsoleLog;
    console.log(this.logOutput);

    console.debug = this.originalConsoleDebug;
    console.debug(this.debugOutput);

    console.info = this.originalConsoleInfo;
    console.info(this.infoOutput);

    console.warn = this.originalConsoleWarn;
    console.warn(this.warnOutput);

    console.error = this.originalConsoleError;
    console.error(this.errorOutput);
  }
}
