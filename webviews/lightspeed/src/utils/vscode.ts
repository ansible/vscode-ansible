// Lightweight wrapper around acquireVsCodeApi() providing structured
// message passing (post/on) and singleton lifecycle management.
//
// Based on @tomjs/vscode-webview v2.0.2 by Tom Gao <tom@tomgao.cc>
// Licensed under the MIT License.
// https://www.npmjs.com/package/@tomjs/vscode-webview
type PostMessageListener<T> = (data: T) => void | Promise<void>;

interface PostMessageOptions {
  typeKey?: string;
  dataKey?: string;
  interval?: number;
  timeout?: number;
}

const TYPE_KEY = "type";
const DATA_KEY = "data";
const INTERVAL = 200;
const TIMEOUT = 10_000;

class WebviewApi<StateType = unknown> {
  private readonly webviewApi:
    | ReturnType<typeof acquireVsCodeApi<StateType>>
    | undefined;
  private _options: Required<PostMessageOptions>;
  private listeners = new Map<
    string | number,
    [PostMessageListener<unknown>, PostMessageListener<unknown>?]
  >();

  constructor(options?: PostMessageOptions) {
    this._options = {
      typeKey: TYPE_KEY,
      dataKey: DATA_KEY,
      interval: INTERVAL,
      timeout: TIMEOUT,
      ...options,
    };

    if (typeof acquireVsCodeApi !== "function") {
      console.error("acquireVsCodeApi is not a function");
      return;
    }

    this.webviewApi = acquireVsCodeApi<StateType>();
    window.addEventListener("message", (event: MessageEvent) => {
      const message = event.data || {};
      this._runListener(
        message[this._options.typeKey],
        message[this._options.dataKey],
      );
    });
  }

  private _postMessage(
    type: string | number,
    data: unknown,
    options: Required<PostMessageOptions>,
  ) {
    if (!this.webviewApi) return;
    this.webviewApi.postMessage({
      [options.typeKey]: type,
      [options.dataKey]: data,
    });
  }

  private _runListener(
    type: string | number | undefined,
    result?: unknown,
    error?: unknown,
  ) {
    if (type === undefined || type === null || this.listeners.size === 0)
      return;
    const listeners = this.listeners.get(type);
    if (listeners) {
      if (result !== undefined && result !== null) {
        listeners[0]?.(result);
      }
      if (error !== undefined && error !== null) {
        listeners[1]?.(error);
      }
    }
  }

  post(type: string | number, data: unknown): void {
    this._postMessage(type, data, this._options);
  }

  postAndReceive<T>(
    type: string | number,
    data: unknown,
    options?: Pick<PostMessageOptions, "interval" | "timeout">,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.webviewApi) {
        reject(new Error("acquireVsCodeApi is not available"));
        return;
      }
      const opts = { ...this._options, ...options };
      const post = () => this._postMessage(type, data, opts);

      const intervalId = setInterval(post, opts.interval);
      const timeoutId = setTimeout(() => {
        window.removeEventListener("message", receive);
        clearInterval(intervalId);
        this._runListener(type, undefined, new Error("Timeout"));
        reject(new Error("Timeout"));
      }, opts.timeout);

      const receive = (e: MessageEvent) => {
        if (
          !e.origin.startsWith("vscode-webview://") ||
          !e.data ||
          e.data[opts.typeKey] !== type
        )
          return;
        window.removeEventListener("message", receive);
        clearTimeout(timeoutId);
        clearInterval(intervalId);
        const res = e.data[opts.dataKey] as T;
        this._runListener(type, res);
        resolve(res);
      };

      window.addEventListener("message", receive);
      post();
    });
  }

  on<T>(
    type: string | number,
    success: PostMessageListener<T>,
    fail?: PostMessageListener<unknown>,
  ): void {
    this.listeners.set(
      type,
      fail
        ? [success as PostMessageListener<unknown>, fail]
        : [success as PostMessageListener<unknown>],
    );
  }

  off(type: string | number): void {
    this.listeners.delete(type);
  }

  postMessage<T = unknown>(message: T): void {
    this.webviewApi?.postMessage(message);
  }

  getState(): StateType | undefined {
    return this.webviewApi?.getState();
  }

  setState<T extends StateType | undefined>(newState: T): T {
    this.webviewApi?.setState(newState);
    return newState;
  }
}

// Exports class singleton to prevent multiple invocations of acquireVsCodeApi.
export const vscodeApi = new WebviewApi<string>();
