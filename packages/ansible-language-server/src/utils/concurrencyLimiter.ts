/**
 * Limits how many asynchronous tasks (e.g. spawned child processes) may run
 * at the same time. Extra tasks are queued (FIFO) until a slot frees up.
 */
export class ConcurrencyLimiter {
  private maxConcurrent: number;
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.maxConcurrent = ConcurrencyLimiter.normalize(maxConcurrent);
  }

  /**
   * Update the concurrency limit at runtime (e.g. when settings change).
   * Queued tasks are dequeued immediately if the new limit allows it.
   */
  public setLimit(maxConcurrent: number): void {
    this.maxConcurrent = ConcurrencyLimiter.normalize(maxConcurrent);
    this.dequeueIfPossible();
  }

  /**
   * Run `task`, waiting for a free slot if the limit has been reached.
   */
  public async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active = this.active + 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active = this.active + 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active = this.active - 1;
    this.dequeueIfPossible();
  }

  private dequeueIfPossible(): void {
    while (this.active <= this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    }
  }

  private static normalize(maxConcurrent: number): number {
    if (!Number.isFinite(maxConcurrent) || maxConcurrent < 1) {
      return 1;
    }
    return Math.floor(maxConcurrent);
  }
}

/**
 * Shared limiter for `ansible-lint` invocations. It is a module-level
 * singleton so that the cap applies across all workspace folders, since
 * each one otherwise triggers linting independently.
 */
export const ansibleLintConcurrencyLimiter = new ConcurrencyLimiter(4);
