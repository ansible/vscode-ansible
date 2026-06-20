import { Disposable, Event, EventEmitter } from 'vscode';

export interface PromiseAdapter<T, U> {
    (value: T, resolve: (value: U | PromiseLike<U>) => void, reject: (reason: unknown) => void): void;
}

const passthrough = (value: unknown, resolve: (value?: unknown) => void) => {
    resolve(value);
};

export function promiseFromEvent<T, U>(
    event: Event<T>,
    adapter: PromiseAdapter<T, U> = passthrough as PromiseAdapter<T, U>,
): { promise: Promise<U>; cancel: EventEmitter<void> } {
    let subscription: Disposable;
    const cancel = new EventEmitter<void>();

    return {
        promise: new Promise<U>((resolve, reject) => {
            cancel.event(() => {
                reject('Cancelled');
            });
            subscription = event((value: T) => {
                try {
                    Promise.resolve(adapter(value, resolve, reject)).catch(reject);
                } catch (error) {
                    reject(error);
                }
            });
        }).then(
            (result: U) => {
                subscription.dispose();
                return result;
            },
            (error) => {
                subscription.dispose();
                throw error;
            },
        ),
        cancel,
    };
}
