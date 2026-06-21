import { Disposable, Event, EventEmitter } from 'vscode';

export type PromiseAdapter<T, U> = (
    value: T,
    resolve: (value: U | PromiseLike<U>) => void,
    reject: (reason: unknown) => void,
) => void;

const passthrough = (value: unknown, resolve: (value?: unknown) => void) => {
    resolve(value);
};

/**
 * Creates a promise that resolves or rejects based on a VS Code event.
 * @param event - The VS Code event to listen on
 * @param adapter - Optional adapter to transform event values before resolving
 * @returns An object containing the promise and a cancel emitter
 */
export function promiseFromEvent<T, U>(
    event: Event<T>,
    adapter: PromiseAdapter<T, U> = passthrough as PromiseAdapter<T, U>,
): { promise: Promise<U>; cancel: EventEmitter<void> } {
    let subscription: Disposable;
    const cancel = new EventEmitter<void>();

    return {
        promise: new Promise<U>((resolve, reject) => {
            cancel.event(() => {
                reject(new Error('Cancelled'));
            });
            subscription = event((value: T) => {
                try {
                    adapter(value, resolve, reject);
                } catch (error) {
                    reject(error instanceof Error ? error : new Error(String(error)));
                }
            });
        }).then(
            (result: U) => {
                subscription.dispose();
                return result;
            },
            (error: unknown) => {
                subscription.dispose();
                throw error;
            },
        ),
        cancel,
    };
}
