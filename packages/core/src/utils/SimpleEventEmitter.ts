export interface Disposable {
    dispose: () => void;
}

export class SimpleEventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];

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

    public fire(e: T): void {
        this.listeners.forEach((l) => l(e));
    }
}
