let logFunction: ((message: string) => void) | undefined;

/**
 * Registers the function used for diagnostic logging throughout core.
 *
 * @param logFn - Callback invoked when log() is called.
 */
export function setLogFunction(logFn: (message: string) => void): void {
    logFunction = logFn;
}

/**
 * Writes a message using the registered log function, or console.log as fallback.
 *
 * @param message - Text to log.
 */
export function log(message: string): void {
    if (logFunction) {
        logFunction(message);
    } else {
        console.log(message);
    }
}

/**
 * Returns the currently registered log function, if any.
 *
 * @returns The active log callback, or undefined when using the console fallback.
 */
export function getLogFunction(): ((message: string) => void) | undefined {
    return logFunction;
}
