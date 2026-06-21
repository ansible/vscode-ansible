/**
 * @file Express-based mock server that stubs the Lightspeed API for WDIO tests.
 *
 * Provides default canned responses for every Lightspeed endpoint and lets
 * individual tests override any endpoint via {@link setResponse}. Override
 * state is cleared between tests with {@link resetResponses}.
 */
import express, { type Request, type Response } from "express";
import type { Server } from "node:http";

/** A canned HTTP response returned by the mock server. */
export interface MockResponse {
  status: number;
  body: unknown;
  /** Artificial delay in milliseconds before responding. */
  delay?: number;
}

/**
 * Default canned responses aligned with {@link LightSpeedAPI} paths:
 * `fetch(\`\${base}/api/\${endpoint}\`)` where `base` is `lightspeed.apiEndpoint`
 * (no trailing `/api` in the setting) and `endpoint` matches Lightspeed URL constants.
 */
const DEFAULT_RESPONSES: Record<string, MockResponse> = {
  "POST /api/v0/ai/completions/": {
    status: 200,
    body: {
      predictions: ["    ansible.builtin.debug:\n      msg: hello world\n"],
    },
  },
  "POST /api/v0/ai/explanations/": {
    status: 200,
    body: {
      explanationId: "mock-explanation-id",
      content: "This playbook installs and configures a web server.",
      format: "markdown",
    },
  },
  "POST /api/v0/ai/generations/": {
    status: 200,
    body: {
      generationId: "mock-playbook-gen",
      playbook:
        "---\n- name: Generated playbook\n  hosts: all\n  tasks:\n    - name: Install httpd\n      ansible.builtin.package:\n        name: httpd\n        state: present\n",
      outline: "1. Install httpd package",
    },
  },
  "POST /api/v1/ai/generations/role/": {
    status: 200,
    body: {
      name: "mock-role",
      generationId: "mock-gen-id",
      outline: "1. Scaffold role structure",
      files: [
        {
          path: "tasks/main.yml",
          file_type: "task",
          content:
            "---\n- name: Mock task\n  ansible.builtin.debug:\n    msg: ok\n",
        },
      ],
    },
  },
  "POST /api/v1/ai/explanations/role/": {
    status: 200,
    body: {
      explanationId: "mock-role-explanation-id",
      content: "This role configures services on target hosts.",
      format: "markdown",
    },
  },
  "GET /api/v0/me/": {
    status: 200,
    body: {
      username: "test-user",
      org_id: "test-org",
      is_entitled: true,
    },
  },
};

/** Map legacy / shorthand keys used in tests to real HTTP keys. */
const ENDPOINT_ALIASES: Record<string, string> = {
  "POST /api/v1/completions": "POST /api/v0/ai/completions/",
  "POST /api/v1/explanations": "POST /api/v0/ai/explanations/",
  "POST /api/v1/generations": "POST /api/v0/ai/generations/",
  "GET /api/v1/me": "GET /api/v0/me/",
};

let overrides = new Map<string, MockResponse>();
let server: Server | null = null;

function canonicalKey(endpoint: string): string {
  return ENDPOINT_ALIASES[endpoint] ?? endpoint;
}

function getResponse(method: string, path: string): MockResponse {
  const rawKey = `${method} ${path}`;
  const key = canonicalKey(rawKey);
  return (
    overrides.get(key) ??
    overrides.get(rawKey) ??
    DEFAULT_RESPONSES[key] ??
    DEFAULT_RESPONSES[rawKey] ?? {
      status: 404,
      body: { error: "not found" },
    }
  );
}

function handler(method: string, path: string) {
  return async (_req: Request, res: Response) => {
    const mock = getResponse(method, path);
    if (mock.delay) {
      await new Promise((r) => setTimeout(r, mock.delay));
    }
    res.status(mock.status).json(mock.body);
  };
}

/**
 * Override the response for a single endpoint.
 *
 * @param endpoint - Key in `"METHOD /path"` format (e.g. `"POST /api/v1/completions"`).
 *   Shorthand aliases are resolved automatically.
 * @param status - HTTP status code to return.
 * @param body - JSON body to return.
 * @param delay - Optional delay in milliseconds before responding.
 */
export function setResponse(
  endpoint: string,
  status: number,
  body: unknown,
  delay?: number,
): void {
  overrides.set(canonicalKey(endpoint), { status, body, delay });
}

/** Clear all per-test overrides, reverting to default canned responses. */
export function resetResponses(): void {
  overrides = new Map();
}

/**
 * Start the mock server on the given port. No-op if already listening.
 * @param port - TCP port to bind to (e.g. `3001`).
 */
export function start(port: number): Promise<void> {
  if (server?.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(express.json());

    const routes: Array<[string, "get" | "post"]> = [
      ["/api/v0/ai/completions/", "post"],
      ["/api/v0/ai/explanations/", "post"],
      ["/api/v0/ai/generations/", "post"],
      ["/api/v1/ai/generations/role/", "post"],
      ["/api/v1/ai/explanations/role/", "post"],
      ["/api/v0/me/", "get"],
    ];

    for (const [routePath, method] of routes) {
      const verb = method.toUpperCase();
      if (method === "post") {
        app.post(routePath, handler(verb, routePath));
      } else {
        app.get(routePath, handler(verb, routePath));
      }
    }

    server = app.listen(port, () => resolve());
    server.once("error", reject);
  });
}

/** Gracefully shut down the mock server. Safe to call when not running. */
export function stop(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    const toClose = server;
    server = null;
    toClose.close((err) => (err ? reject(err) : resolve()));
  });
}
