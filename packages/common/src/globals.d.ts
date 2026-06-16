/**
 * Minimal ambient declarations for universal JavaScript globals.
 * This package uses neither @types/node nor the 'dom' lib to stay
 * environment-agnostic. Only globals available in ALL runtimes
 * (Node, browsers, Deno, web workers) are declared here.
 */

declare const console: {
    log(...args: unknown[]): void;
    error(...args: unknown[]): void;
    warn(...args: unknown[]): void;
};
