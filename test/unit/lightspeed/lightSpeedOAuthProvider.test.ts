import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import * as vscode from "vscode";
import {
  LightSpeedAuthenticationProvider,
  isSupportedCallback,
} from "@src/features/lightspeed/lightSpeedOAuthProvider";
import * as webUtils from "@src/features/lightspeed/utils/webUtils";
import { lightSpeedManager } from "@src/extension";
import { LightSpeedCommands } from "@src/definitions/lightspeed";
import type { SettingsManager } from "@src/settings";
import type { Log } from "@src/utils/logger";

// The SUT imports `lightSpeedManager` at module load and uses it inside
// createSession (`currentModelValue` + `lightspeedAuthenticatedUser.getUserInfo`).
vi.mock("@src/extension", () => ({
  lightSpeedManager: {
    currentModelValue: undefined,
    lightspeedAuthenticatedUser: { getUserInfo: vi.fn() },
  },
}));

// Override getBaseUri while keeping the real auth-id constants, secret keys,
// helpers (getUserTypeLabel, calculate/coerce expiry, UriEventHandler) intact.
vi.mock("@src/features/lightspeed/utils/webUtils", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@src/features/lightspeed/utils/webUtils")
    >();
  return { ...actual, getBaseUri: vi.fn() };
});

const getBaseUriMock = webUtils.getBaseUri as unknown as Mock;
const { SESSIONS_SECRET_KEY, ACCOUNT_SECRET_KEY } = webUtils;
const getUserInfoMock = lightSpeedManager.lightspeedAuthenticatedUser
  .getUserInfo as unknown as Mock;

// These tests deliberately reach into private members of the provider
// (_sessionChangeEmitter, _disposable, login, handleUriForCode, ...). vitest
// transpiles without type info, but vue-tsc --noEmit in CI enforces private
// access, so alias to any for those reaches.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProvider = Record<string, any>;

const fetchMock = vi.fn();

interface FakeResponseOptions {
  ok?: boolean;
  status?: number;
  body?: unknown;
}

function fakeResponse({
  ok = true,
  status = 200,
  body = {},
}: FakeResponseOptions = {}) {
  return { ok, status, json: () => Promise.resolve(body) };
}

let consoleErrorSpy: Mock;
let secretsGet: Mock;
let secretsStore: Mock;
let logger: { debug: Mock; trace: Mock; info: Mock };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let context: any;
let provider: AnyProvider;

function makeProvider(
  packageJSON: unknown = { publisher: "redhat", name: "ansible" },
) {
  secretsGet = vi.fn();
  secretsStore = vi.fn();
  context = {
    secrets: { get: secretsGet, store: secretsStore },
    extension: { packageJSON },
  };
  logger = { debug: vi.fn(), trace: vi.fn(), info: vi.fn() };
  return new LightSpeedAuthenticationProvider(
    context as unknown as vscode.ExtensionContext,
    {} as unknown as SettingsManager,
    logger as unknown as Log,
    "auth-lightspeed",
    "Ansible Lightspeed",
  ) as unknown as AnyProvider;
}

// Subscribe through the public event so tests verify the real notification
// path (onDidChangeSessions) rather than spying on the internal emitter.
type SessionChangeEvent = {
  added?: readonly unknown[];
  removed?: readonly unknown[];
  changed?: readonly unknown[];
};
function captureSessionChanges(): SessionChangeEvent[] {
  const events: SessionChangeEvent[] = [];
  // The shared MockEventEmitter.event is an unbound prototype method, so a
  // detached `onDidChangeSessions(listener)` call would bind `this` to the
  // provider instead of the emitter. Install a minimal bound emitter so the
  // public event path actually delivers payloads through onDidChangeSessions.
  const listeners: Array<(e: SessionChangeEvent) => void> = [];
  provider._sessionChangeEmitter = {
    event: (listener: (e: SessionChangeEvent) => void) => {
      listeners.push(listener);
      return { dispose: () => undefined };
    },
    fire: (e: SessionChangeEvent) => listeners.forEach((l) => l(e)),
  };
  provider.onDidChangeSessions((e: SessionChangeEvent) => {
    events.push(e);
  });
  return events;
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) so prior mockResolvedValue/
  // mockImplementation state on shared fakes does not leak between tests.
  vi.resetAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);

  consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined) as unknown as Mock;

  // vscode env extensions the alias mock lacks.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vscode.env as any).uriScheme = "vscode";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vscode.env as any).asExternalUri = vi.fn(async () => ({
    toString: (): string => "vscode://redhat.ansible/cb",
  }));
  (vscode.Uri.parse as unknown as Mock).mockImplementation((s: string) => ({
    raw: s,
    with: () => ({ raw: s, scheme: "https" }),
    toString: () => s,
  }));

  getBaseUriMock.mockResolvedValue("https://lightspeed.example");

  provider = makeProvider();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isSupportedCallback", () => {
  it("accepts the vscode desktop scheme", () => {
    expect(isSupportedCallback({ scheme: "vscode" } as never)).toBe(true);
  });

  it("accepts openshift devspaces hosts", () => {
    expect(
      isSupportedCallback({
        scheme: "https",
        authority: "foo.openshiftapps.com",
      } as never),
    ).toBe(true);
  });

  it("accepts github codespaces hosts", () => {
    expect(isSupportedCallback({ authority: "foo.github.dev" } as never)).toBe(
      true,
    );
  });

  it("rejects an unrelated http host", () => {
    expect(
      isSupportedCallback({
        scheme: "http",
        authority: "example.com",
      } as never),
    ).toBe(false);
  });
});

describe("redirect URI helpers", () => {
  it("computes/sets the external redirect URI from packageJSON", async () => {
    await provider.setExternalRedirectUri();
    expect(provider._externalRedirectUri).toBe("vscode://redhat.ansible/cb");
    expect(vscode.Uri.parse).toHaveBeenCalledWith("vscode://redhat.ansible");
  });

  it("falls back to empty publisher/name when packageJSON is empty", async () => {
    const p = makeProvider({});
    await LightSpeedAuthenticationProvider.getExternalRedirectUri(
      p.context as unknown as vscode.ExtensionContext,
    );
    expect(vscode.Uri.parse).toHaveBeenCalledWith("vscode://.");
  });
});

describe("createSession", () => {
  it("creates a session for a licensed admin user", async () => {
    const account = {
      type: "oauth",
      accessToken: "AT",
      refreshToken: "RT",
      expiresAtTimestampInSeconds: 123,
    };
    vi.spyOn(provider, "login").mockResolvedValue(account);
    getUserInfoMock.mockResolvedValue({
      external_username: "u",
      rh_org_has_subscription: true,
      rh_user_is_org_admin: true,
    });
    const events = captureSessionChanges();

    const session = await provider.createSession([]);

    expect(session.account.label).toBe("u (licensed)");
    expect(session.rhOrgHasSubscription).toBe(true);
    expect(session.rhUserIsOrgAdmin).toBe(true);
    expect(secretsStore).toHaveBeenCalledWith(
      SESSIONS_SECRET_KEY,
      expect.any(String),
    );
    expect(events).toHaveLength(1);
    expect(events[0].added).toHaveLength(1);
  });

  it("throws when login yields no account", async () => {
    vi.spyOn(provider, "login").mockResolvedValue(undefined);
    await expect(provider.createSession([])).rejects.toThrow(
      "Ansible Lightspeed login failure",
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("uses username fallback and unlicensed label", async () => {
    vi.spyOn(provider, "login").mockResolvedValue({
      type: "oauth",
      accessToken: "AT",
      refreshToken: "RT",
      expiresAtTimestampInSeconds: 1,
    });
    getUserInfoMock.mockResolvedValue({
      username: "only-username",
      rh_org_has_subscription: false,
    });
    const session = await provider.createSession([]);
    expect(session.account.label).toBe("only-username (unlicensed)");
    expect(session.rhOrgHasSubscription).toBe(false);
    expect(session.rhUserIsOrgAdmin).toBe(false);
  });

  it("uses an empty name when no username is provided", async () => {
    vi.spyOn(provider, "login").mockResolvedValue({
      type: "oauth",
      accessToken: "AT",
      refreshToken: "RT",
      expiresAtTimestampInSeconds: 1,
    });
    getUserInfoMock.mockResolvedValue({});
    const session = await provider.createSession([]);
    expect(session.account.label).toBe(" (unlicensed)");
  });
});

describe("removeSession", () => {
  it("removes a stored session and fires a removed event", async () => {
    secretsGet.mockResolvedValue(
      JSON.stringify([{ id: "a" }, { id: "target" }]),
    );
    const events = captureSessionChanges();

    await provider.removeSession("target");

    expect(secretsStore).toHaveBeenCalledWith(
      SESSIONS_SECRET_KEY,
      expect.any(String),
    );
    // The persisted list must no longer contain the removed id (a regression
    // that re-saved the original array would otherwise pass).
    const [, storedSessions] = secretsStore.mock.calls[0];
    expect(JSON.parse(storedSessions as string)).toEqual([{ id: "a" }]);
    expect(events).toHaveLength(1);
    expect(events[0].removed).toEqual([{ id: "target" }]);
  });

  it("stores without firing when the id is absent", async () => {
    secretsGet.mockResolvedValue(JSON.stringify([{ id: "a" }]));
    const events = captureSessionChanges();

    await provider.removeSession("missing");

    expect(secretsStore).toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });

  it("returns early when there are no stored sessions", async () => {
    secretsGet.mockResolvedValue(undefined);
    await provider.removeSession("x");
    expect(secretsStore).not.toHaveBeenCalled();
  });
});

describe("getSessions / setMockSession / onDidChangeSessions", () => {
  it("parses stored sessions", async () => {
    secretsGet.mockResolvedValue(JSON.stringify([{ id: "a" }]));
    const sessions = await provider.getSessions();
    expect(sessions).toEqual([{ id: "a" }]);
  });

  it("returns an empty array when nothing is stored", async () => {
    secretsGet.mockResolvedValue(undefined);
    expect(await provider.getSessions()).toEqual([]);
  });

  it("writes a synthetic session and fires an added event", async () => {
    secretsGet.mockResolvedValue(undefined);
    const events = captureSessionChanges();

    await provider.setMockSession({
      accessToken: "tok",
      accountId: "id-1",
      accountLabel: "Mock User",
    });

    expect(secretsStore).toHaveBeenCalledWith(
      SESSIONS_SECRET_KEY,
      expect.any(String),
    );
    expect(events).toHaveLength(1);
    expect(events[0].added).toEqual([expect.objectContaining({ id: "id-1" })]);
  });

  it("exposes the session-change event", () => {
    expect(typeof provider.onDidChangeSessions).toBe("function");
  });
});

describe("initialize / dispose", () => {
  function stubRegistrations() {
    (
      vscode.authentication.registerAuthenticationProvider as unknown as Mock
    ).mockReturnValue({ dispose: vi.fn() });
    (vscode.window.registerUriHandler as unknown as Mock).mockReturnValue({
      dispose: vi.fn(),
    });
  }

  it("is idempotent once registered", () => {
    stubRegistrations();
    provider.initialize();
    const first = provider._disposable;
    provider.initialize();
    expect(provider._disposable).toBe(first);
    expect(logger.debug).toHaveBeenCalledWith(
      "[ansible-lightspeed-oauth] Auth provider already registered",
    );
  });

  it("removes the active session on dispose when authenticated", async () => {
    stubRegistrations();
    (vscode.authentication.getSession as unknown as Mock).mockResolvedValue({
      id: "acc-1",
    });
    const removeSpy = vi
      .spyOn(provider, "removeSession")
      .mockResolvedValue(undefined);
    provider.initialize();
    const disp = provider._disposable;

    await provider.dispose();

    expect(removeSpy).toHaveBeenCalledWith("acc-1");
    expect(disp.dispose).toHaveBeenCalled();
    expect(provider._disposable).toBeUndefined();
  });

  it("disposes without removing a session when not authenticated", async () => {
    stubRegistrations();
    (vscode.authentication.getSession as unknown as Mock).mockResolvedValue(
      undefined,
    );
    const removeSpy = vi.spyOn(provider, "removeSession");
    provider.initialize();
    const disp = provider._disposable;

    await provider.dispose();

    expect(removeSpy).not.toHaveBeenCalled();
    expect(disp.dispose).toHaveBeenCalled();
  });

  it("is a no-op when never initialized", async () => {
    const removeSpy = vi.spyOn(provider, "removeSession");
    await provider.dispose();
    expect(removeSpy).not.toHaveBeenCalled();
    expect(vscode.authentication.getSession).not.toHaveBeenCalled();
  });
});

describe("login", () => {
  it("throws when the base URI is not configured", async () => {
    getBaseUriMock.mockResolvedValue("");
    await expect(provider.login([])).rejects.toThrow(
      "Please enter the Ansible Lightspeed URL",
    );
  });

  it("resolves an account from the redirect callback", async () => {
    const account = {
      type: "oauth",
      accessToken: "AT",
      refreshToken: "RT",
      expiresAtTimestampInSeconds: 999,
    };
    const reqSpy = vi
      .spyOn(provider, "requestOAuthAccountFromCode")
      .mockResolvedValue(account);

    // Replace the UriEventHandler with a binding-safe emitter, since the alias
    // mock's EventEmitter.event method is not auto-bound.
    const listeners: Array<(u: { query: string }) => void> = [];
    provider._uriHandler = {
      event: (l: (u: { query: string }) => void) => {
        listeners.push(l);
        return { dispose: () => undefined };
      },
      fire: (u: { query: string }) => listeners.forEach((l) => l(u)),
    };

    getBaseUriMock.mockResolvedValue("https://ls.example");
    (vscode.window.withProgress as unknown as Mock).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_opts: any, task: any) => {
        const token = {
          onCancellationRequested: () => ({ dispose: () => undefined }),
        };
        const p = task({ report: vi.fn() }, token);
        provider._uriHandler.fire({ query: "code=the-code" });
        return p;
      },
    );

    const result = await provider.login([]);

    expect(result).toBe(account);
    expect(vscode.env.openExternal).toHaveBeenCalled();
    expect(reqSpy).toHaveBeenCalledWith("the-code");
  });
});

describe("handleUriForCode", () => {
  it("rejects when no code is present", async () => {
    const adapter = provider.handleUriForCode([]);
    const resolve = vi.fn();
    const reject = vi.fn();
    await adapter({ query: "" }, resolve, reject);
    expect(reject).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("No code received"),
      }),
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects when the account cannot be formed", async () => {
    vi.spyOn(provider, "requestOAuthAccountFromCode").mockResolvedValue(
      undefined,
    );
    const adapter = provider.handleUriForCode([]);
    const resolve = vi.fn();
    const reject = vi.fn();
    await adapter({ query: "code=abc" }, resolve, reject);
    expect(reject).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Unable to form account" }),
    );
  });

  it("resolves with the account on success", async () => {
    const account = { type: "oauth", accessToken: "AT" };
    vi.spyOn(provider, "requestOAuthAccountFromCode").mockResolvedValue(
      account,
    );
    const adapter = provider.handleUriForCode([]);
    const resolve = vi.fn();
    const reject = vi.fn();
    await adapter({ query: "code=abc" }, resolve, reject);
    expect(resolve).toHaveBeenCalledWith(account);
    expect(reject).not.toHaveBeenCalled();
  });
});

describe("requestOAuthAccountFromCode", () => {
  it("throws and logs on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: false, status: 403 }));
    await expect(provider.requestOAuthAccountFromCode("c")).rejects.toThrow(
      "Request failed with status code: 403",
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("defaults missing tokens to empty strings and stores the account", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: true, body: {} }));
    const account = await provider.requestOAuthAccountFromCode("c");
    expect(account.accessToken).toBe("");
    expect(account.refreshToken).toBe("");
    expect(secretsStore).toHaveBeenCalledWith(
      ACCOUNT_SECRET_KEY,
      expect.any(String),
    );
  });

  it("rethrows fetch errors and logs error metadata", async () => {
    const err = Object.assign(new Error("network down"), {
      code: "ECONNREFUSED",
      cause: "boom",
    });
    fetchMock.mockRejectedValue(err);
    await expect(provider.requestOAuthAccountFromCode("c")).rejects.toThrow(
      "network down",
    );
    const lastCall = consoleErrorSpy.mock.calls.at(-1);
    expect(lastCall?.[1]).toMatchObject({
      name: "Error",
      message: "network down",
      cause: "boom",
      code: "ECONNREFUSED",
    });
  });
});

describe("requestTokenAfterExpiry", () => {
  const currentAccount = {
    type: "oauth",
    accessToken: "old",
    refreshToken: "r",
    expiresAtTimestampInSeconds: 1,
  };

  beforeEach(() => {
    (vscode.window.withProgress as unknown as Mock).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_opts: any, task: any) => task(),
    );
  });

  it("returns a refreshed account and stores it", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({
        ok: true,
        body: { access_token: "new", refresh_token: "nr", expires_in: 3600 },
      }),
    );
    const account = await provider.requestTokenAfterExpiry(currentAccount);
    expect(account.accessToken).toBe("new");
    expect(account.refreshToken).toBe("nr");
    expect(secretsStore).toHaveBeenCalledWith(
      ACCOUNT_SECRET_KEY,
      expect.any(String),
    );
  });

  it("falls back to the current tokens when the response omits them", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: true, body: {} }));
    const account = await provider.requestTokenAfterExpiry(currentAccount);
    expect(account.accessToken).toBe("old");
    expect(account.refreshToken).toBe("r");
  });

  it("throws on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: false, status: 500 }));
    await expect(
      provider.requestTokenAfterExpiry(currentAccount),
    ).rejects.toThrow("Request failed with status code: 500");
  });

  it("rethrows fetch errors", async () => {
    fetchMock.mockRejectedValue(new Error("refresh boom"));
    await expect(
      provider.requestTokenAfterExpiry(currentAccount),
    ).rejects.toThrow("refresh boom");
  });
});

describe("refreshAccessToken", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = { id: "sess-1" } as any;
  const nowSeconds = () => Math.floor(Date.now() / 1000);

  it("throws when no account is stored", async () => {
    secretsGet.mockResolvedValue(undefined);
    await expect(provider.refreshAccessToken(session)).rejects.toThrow(
      "Unable to fetch account",
    );
  });

  it("returns the current token when it is still valid", async () => {
    const account = {
      type: "oauth",
      accessToken: "valid-token",
      refreshToken: "r",
      expiresAtTimestampInSeconds: nowSeconds() + 100000,
    };
    secretsGet.mockImplementation(async (key: string) =>
      key === ACCOUNT_SECRET_KEY ? JSON.stringify(account) : undefined,
    );
    const reqSpy = vi.spyOn(provider, "requestTokenAfterExpiry");

    const token = await provider.refreshAccessToken(session);

    expect(token).toBe("valid-token");
    expect(reqSpy).not.toHaveBeenCalled();
  });

  it("refreshes, updates sessions and fires a changed event", async () => {
    const expired = {
      type: "oauth",
      accessToken: "old",
      refreshToken: "r",
      expiresAtTimestampInSeconds: nowSeconds() - 100,
    };
    const sessions = [
      {
        id: "sess-1",
        accessToken: "old",
        account: { id: "sess-1", label: "u" },
        scopes: [],
      },
    ];
    secretsGet.mockImplementation(async (key: string) => {
      if (key === ACCOUNT_SECRET_KEY) return JSON.stringify(expired);
      if (key === SESSIONS_SECRET_KEY) return JSON.stringify(sessions);
      return undefined;
    });
    vi.spyOn(provider, "requestTokenAfterExpiry").mockResolvedValue({
      type: "oauth",
      accessToken: "fresh",
      refreshToken: "r2",
      expiresAtTimestampInSeconds: nowSeconds() + 100000,
    });
    const events = captureSessionChanges();

    const token = await provider.refreshAccessToken(session);

    expect(token).toBe("fresh");
    expect(secretsStore).toHaveBeenCalledWith(
      ACCOUNT_SECRET_KEY,
      expect.any(String),
    );
    expect(secretsStore).toHaveBeenCalledWith(
      SESSIONS_SECRET_KEY,
      expect.any(String),
    );
    expect(events).toHaveLength(1);
    expect(events[0].changed).toHaveLength(1);
  });

  it("prompts to reconnect when the refresh fails", async () => {
    const expired = {
      type: "oauth",
      accessToken: "old",
      refreshToken: "r",
      expiresAtTimestampInSeconds: nowSeconds() - 100,
    };
    secretsGet.mockImplementation(async (key: string) =>
      key === ACCOUNT_SECRET_KEY ? JSON.stringify(expired) : undefined,
    );
    vi.spyOn(provider, "requestTokenAfterExpiry").mockResolvedValue(undefined);
    const removeSpy = vi
      .spyOn(provider, "removeSession")
      .mockResolvedValue(undefined);
    (vscode.window.showWarningMessage as unknown as Mock).mockResolvedValue(
      "Reconnect",
    );

    await provider.refreshAccessToken(session);

    expect(removeSpy).toHaveBeenCalledWith("sess-1");
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      LightSpeedCommands.LIGHTSPEED_AUTH_REQUEST,
    );
  });

  it("does not execute a command when the reconnect prompt is dismissed", async () => {
    const expired = {
      type: "oauth",
      accessToken: "old",
      refreshToken: "r",
      expiresAtTimestampInSeconds: nowSeconds() - 100,
    };
    secretsGet.mockImplementation(async (key: string) =>
      key === ACCOUNT_SECRET_KEY ? JSON.stringify(expired) : undefined,
    );
    vi.spyOn(provider, "requestTokenAfterExpiry").mockResolvedValue(undefined);
    vi.spyOn(provider, "removeSession").mockResolvedValue(undefined);
    (vscode.window.showWarningMessage as unknown as Mock).mockResolvedValue(
      undefined,
    );

    await provider.refreshAccessToken(session);

    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  it("returns the refreshed token without a changed event when no sessions are stored", async () => {
    const expired = {
      type: "oauth",
      accessToken: "old",
      refreshToken: "r",
      expiresAtTimestampInSeconds: nowSeconds() - 100,
    };
    secretsGet.mockImplementation(async (key: string) =>
      key === ACCOUNT_SECRET_KEY ? JSON.stringify(expired) : undefined,
    );
    vi.spyOn(provider, "requestTokenAfterExpiry").mockResolvedValue({
      type: "oauth",
      accessToken: "fresh",
      refreshToken: "r2",
      expiresAtTimestampInSeconds: nowSeconds() + 100000,
    });
    const events = captureSessionChanges();

    const token = await provider.refreshAccessToken(session);

    expect(token).toBe("fresh");
    expect(events).toHaveLength(0);
  });
});
