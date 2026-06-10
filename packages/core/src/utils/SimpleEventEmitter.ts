export interface Disposable {
    dispose: () => void;
}

/**
 * Lightweight publish-subscribe event emitter for environments without VS Code.
 */
export class SimpleEventEmitter<T> {
    private listeners: ((e: T) => void)[] = [];

    public event = (listener: (e: T) => void): Disposable => {
        this.listeners.push(listener);
        return {
            dispose: () => {
                const idx = this.listeners.indexOf(listener);
                if (idx >= 0) {
                    this.listeners.splice(idx, 1);
                }
            },
        };
    };

    /**
     * Notifies all registered listeners with the given event payload.
     *
     * @param e - Event payload delivered to each listener.
     */
    public fire(e: T): void {
        this.listeners.forEach((l) => {
            l(e);
        });
    }
}
