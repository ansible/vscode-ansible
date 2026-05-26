let logFunction: ((message: string) => void) | undefined;

export function setLogFunction(logFn: (message: string) => void): void {
    logFunction = logFn;
}

export function log(message: string): void {
    if (logFunction) {
        logFunction(message);
    } else {
        console.log(message);
    }
}

export function getLogFunction(): ((message: string) => void) | undefined {
    return logFunction;
}
