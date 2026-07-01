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
  LightspeedUser,
  AuthProviderType,
} from "@src/features/lightspeed/lightspeedUser";
import * as webUtils from "@src/features/lightspeed/utils/webUtils";
import { LightSpeedAuthenticationProvider } from "@src/features/lightspeed/lightSpeedOAuthProvider";
import { LightSpeedCommands } from "@src/definitions/lightspeed";

// Override getBaseUri while keeping the real auth-id constants the module
// relies on at import time (AuthProviderType is built from them).
vi.mock("@src/features/lightspeed/utils/webUtils", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@src/features/lightspeed/utils/webUtils")
    >();
  return { ...actual, getBaseUri: vi.fn() };
});

const getBaseUriMock = webUtils.getBaseUri as unknown as Mock;
const getSessionMock = vscode.authentication.getSession as unknown as Mock;

interface PrivateLightspeedUser {
  _userType: AuthProviderType | undefined;
  _session: vscode.AuthenticationSession | undefined;
  acquireSessionByProviderOrder(
    createIfNone: boolean,
  ): Promise<vscode.AuthenticationSession | undefined>;
  setLightspeedUser(
    createIfNone: boolean,
    useProviderType?: AuthProviderType,
  ): Promise<void>;
}

function makeUser(opts?: { enabled?: boolean; provider?: string }) {
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  };
  const settingsManager = {
    settings: {
      lightSpeedService: {
        enabled: opts?.enabled ?? true,
        provider: opts?.provider ?? "lightspeed",
      },
    },
  };
  const context = { extension: { extensionKind: vscode.ExtensionKind.UI } };
  const user = new LightspeedUser(
    context as unknown as vscode.ExtensionContext,
    settingsManager as unknown as never,
    {} as never,
    logger as unknown as never,
  );
  return { user, logger };
}

const fakeSession = (id: string): vscode.AuthenticationSession =>
  ({
    id,
    accessToken: `token-${id}`,
    account: { id, label: id },
    scopes: [],
  }) as unknown as vscode.AuthenticationSession;

const priv = (user: LightspeedUser) => user as unknown as PrivateLightspeedUser;

describe("LightspeedUser.logAuthProviderDebugHints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when the Lightspeed service is disabled", async () => {
    const { user, logger } = makeUser({ enabled: false });
    await user.logAuthProviderDebugHints();
    expect(getBaseUriMock).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs an info hint with the provider and resolved URI when enabled", async () => {
    getBaseUriMock.mockResolvedValue("https://lightspeed.example");
    const { user, logger } = makeUser({ provider: "lightspeed" });
    await user.logAuthProviderDebugHints();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0][0]).toContain("provider: lightspeed");
    expect(logger.info.mock.calls[0][0]).toContain(
      "https://lightspeed.example",
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs the Error message when resolving the base URI rejects", async () => {
    getBaseUriMock.mockRejectedValue(new Error("uri boom"));
    const { user, logger } = makeUser();
    await user.logAuthProviderDebugHints();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][0]).toContain("uri boom");
  });

  it("stringifies a non-Error rejection value", async () => {
    getBaseUriMock.mockRejectedValue("plain string failure");
    const { user, logger } = makeUser();
    await user.logAuthProviderDebugHints();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][0]).toContain("plain string failure");
  });
});

describe("LightspeedUser.acquireSessionByProviderOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the first provider's silent session and records its type", async () => {
    const { user } = makeUser();
    vi.spyOn(user, "getAuthProviderOrder").mockResolvedValue([
      AuthProviderType.lightspeed,
      AuthProviderType.rhsso,
    ]);
    const session = fakeSession("silent-1");
    getSessionMock.mockResolvedValueOnce(session);

    const result = await priv(user).acquireSessionByProviderOrder(false);

    expect(result).toBe(session);
    expect(priv(user)._userType).toBe(AuthProviderType.lightspeed);
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(getSessionMock.mock.calls[0][0]).toBe(AuthProviderType.lightspeed);
    expect(getSessionMock.mock.calls[0][2]).toEqual({ silent: true });
  });

  it("falls back to the preferred provider with createIfNone when no silent session exists", async () => {
    const { user } = makeUser();
    vi.spyOn(user, "getAuthProviderOrder").mockResolvedValue([
      AuthProviderType.lightspeed,
      AuthProviderType.rhsso,
    ]);
    const session = fakeSession("fallback");
    getSessionMock
      .mockResolvedValueOnce(undefined) // silent: lightspeed
      .mockResolvedValueOnce(undefined) // silent: rhsso
      .mockResolvedValueOnce(session); // fallback createIfNone

    const result = await priv(user).acquireSessionByProviderOrder(true);

    expect(result).toBe(session);
    expect(priv(user)._userType).toBe(AuthProviderType.lightspeed);
    expect(getSessionMock).toHaveBeenCalledTimes(3);
    expect(getSessionMock.mock.calls[2][2]).toEqual({ createIfNone: true });
  });

  it("returns undefined when neither silent nor fallback yields a session", async () => {
    const { user } = makeUser();
    vi.spyOn(user, "getAuthProviderOrder").mockResolvedValue([
      AuthProviderType.lightspeed,
      AuthProviderType.rhsso,
    ]);
    getSessionMock.mockResolvedValue(undefined);

    const result = await priv(user).acquireSessionByProviderOrder(false);

    expect(result).toBeUndefined();
    expect(priv(user)._userType).toBeUndefined();
  });
});

describe("LightspeedUser.setLightspeedUser (provider-order wiring)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns early without touching auth when the service is disabled", async () => {
    const { user } = makeUser({ enabled: false });
    await priv(user).setLightspeedUser(false);
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("delegates to the provider-order resolver and clears state when no session is found", async () => {
    const { user } = makeUser();
    vi.spyOn(user, "getAuthProviderOrder").mockResolvedValue([
      AuthProviderType.lightspeed,
      AuthProviderType.rhsso,
    ]);
    getSessionMock.mockResolvedValue(undefined);

    await priv(user).setLightspeedUser(false);

    // No session => provider-order path ran and state was reset.
    expect(getSessionMock).toHaveBeenCalled();
    expect(priv(user)._session).toBeUndefined();
    expect(priv(user)._userType).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Additional coverage for branch-heavy paths in LightspeedUser.
// ---------------------------------------------------------------------------

const getExtensionMock = vscode.extensions.getExtension as unknown as Mock;
const executeCommandMock = vscode.commands.executeCommand as unknown as Mock;
const showWarningMock = vscode.window.showWarningMessage as unknown as Mock;

interface AnyUser {
  _userType: AuthProviderType | undefined;
  _session: vscode.AuthenticationSession | undefined;
  _userDetails: unknown;
  _markdownUserDetails: string | undefined;
  _extensionHost: string;
  _getUserInfoCache: {
    locked: boolean;
    token: string;
    time: number;
    userInfo?: unknown;
  };
  _updateUserInformation(
    createIfNone: boolean,
    session: vscode.AuthenticationSession,
  ): Promise<boolean>;
  setLightspeedUser(
    createIfNone: boolean,
    useProviderType?: AuthProviderType,
  ): Promise<void>;
}

const P = (u: LightspeedUser) => u as unknown as AnyUser;

const fullUserInfo = () => ({
  username: "u",
  external_username: "ext",
  rh_user_has_seat: true,
  rh_org_has_subscription: true,
  rh_user_is_org_admin: true,
  org_telemetry_opt_out: false,
});

function mkRes(opts: { ok?: boolean; status?: number; json?: unknown }) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    json: vi.fn().mockResolvedValue("json" in opts ? opts.json : {}),
  };
}

function mkUser(opts?: {
  enabled?: boolean;
  provider?: string;
  extensionKind?: number;
  navigatorDefined?: boolean;
  authProvider?: { removeSession?: Mock; refreshAccessToken?: Mock };
}) {
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  };
  const settingsManager = {
    settings: {
      lightSpeedService: {
        enabled: opts?.enabled ?? true,
        provider: opts?.provider ?? "wca",
      },
    },
  };
  const context = {
    extension: {
      extensionKind: opts?.extensionKind ?? vscode.ExtensionKind.UI,
      packageJSON: {},
    },
  };
  const authProvider = opts?.authProvider ?? {
    removeSession: vi.fn(),
    refreshAccessToken: vi.fn(),
  };
  // navigator must be controlled before construction (host detection happens
  // in the constructor).
  vi.stubGlobal("navigator", opts?.navigatorDefined ? {} : undefined);
  const user = new LightspeedUser(
    context as unknown as vscode.ExtensionContext,
    settingsManager as unknown as never,
    authProvider as unknown as never,
    logger as unknown as never,
  );
  vi.unstubAllGlobals();
  return { user, logger, authProvider, settingsManager };
}

describe("LightspeedUser constructor extension host detection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("detects the Remote host (no navigator, Workspace extension kind)", () => {
    const { user } = mkUser({
      extensionKind: vscode.ExtensionKind.Workspace,
      navigatorDefined: false,
    });
    expect(P(user)._extensionHost).toBe("Remote");
  });

  it("detects the WebWorker host when navigator is defined", () => {
    const { user } = mkUser({ navigatorDefined: true });
    expect(P(user)._extensionHost).toBe("WebWorker");
  });
});

describe("LightspeedUser.setLightspeedUser (explicit provider type)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBaseUriMock.mockResolvedValue("https://x");
  });

  it("uses RHSSO scopes, records the user type and returns early on success", async () => {
    const { user } = mkUser();
    const session = fakeSession("s");
    getSessionMock.mockResolvedValue(session);
    vi.spyOn(user, "getUserInfo").mockResolvedValue(fullUserInfo());
    vi.spyOn(user, "getUserInfoFromMarkdown").mockResolvedValue("md");

    await P(user).setLightspeedUser(true, AuthProviderType.rhsso);

    expect(P(user)._userType).toBe(AuthProviderType.rhsso);
    expect(P(user)._session).toBe(session);
    expect(getSessionMock.mock.calls[0][1]).toEqual(["api.lightspeed"]);
    expect(getSessionMock.mock.calls[0][2]).toEqual({ createIfNone: true });
  });
});

describe("LightspeedUser.getUserInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBaseUriMock.mockResolvedValue("https://x");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns a cached result on the second call without re-fetching", async () => {
    const { user } = mkUser();
    const f = vi.fn().mockResolvedValue(mkRes({ json: fullUserInfo() }));
    vi.stubGlobal("fetch", f);

    const a = await user.getUserInfo("tok");
    const b = await user.getUserInfo("tok");

    expect(f).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
  });

  it("rejects with LightspeedAccessDenied on a 401 and resets the lock", async () => {
    const { user } = mkUser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mkRes({ ok: false, status: 401 })),
    );

    await expect(user.getUserInfo("tok")).rejects.toThrow(/Access Denied/);
    expect(P(user)._getUserInfoCache.locked).toBe(false);
  });

  it("rejects with a generic message on a 500", async () => {
    const { user } = mkUser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mkRes({ ok: false, status: 500 })),
    );

    await expect(user.getUserInfo("tok")).rejects.toThrow(
      "Request failed with status code: 500",
    );
  });

  it("throws when the payload is not an object", async () => {
    const { user } = mkUser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mkRes({ ok: true, status: 200, json: null })),
    );

    await expect(user.getUserInfo("tok")).rejects.toThrow(
      "Unexpected userinfo payload",
    );
  });
});

describe("LightspeedUser.getUserInfoFromMarkdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBaseUriMock.mockResolvedValue("https://x");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns the content on success", async () => {
    const { user } = mkUser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mkRes({ json: { content: "md-body" } })),
    );
    await expect(user.getUserInfoFromMarkdown("tok")).resolves.toBe("md-body");
  });

  it("rejects with LightspeedAccessDenied on a 401", async () => {
    const { user } = mkUser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mkRes({ ok: false, status: 401 })),
    );
    await expect(user.getUserInfoFromMarkdown("tok")).rejects.toThrow(
      /Access Denied/,
    );
  });

  it("rejects with a generic message on a 500", async () => {
    const { user } = mkUser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mkRes({ ok: false, status: 500 })),
    );
    await expect(user.getUserInfoFromMarkdown("tok")).rejects.toThrow(
      "Request failed with status code: 500",
    );
  });
});

describe("LightspeedUser.getAuthProviderOrder", () => {
  let savedPrefer: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    savedPrefer = process.env.LIGHTSPEED_PREFER_RHSSO_AUTH;
    delete process.env.LIGHTSPEED_PREFER_RHSSO_AUTH;
  });
  afterEach(() => {
    if (savedPrefer === undefined) {
      delete process.env.LIGHTSPEED_PREFER_RHSSO_AUTH;
    } else {
      process.env.LIGHTSPEED_PREFER_RHSSO_AUTH = savedPrefer;
    }
    vi.unstubAllGlobals();
  });

  it("returns [lightspeed] when the redhat-account extension is absent", async () => {
    getExtensionMock.mockReturnValue(undefined);
    const { user } = mkUser();
    await expect(user.getAuthProviderOrder()).resolves.toEqual([
      AuthProviderType.lightspeed,
    ]);
  });

  it("prefers RHSSO when LIGHTSPEED_PREFER_RHSSO_AUTH=true", async () => {
    getExtensionMock.mockReturnValue({});
    process.env.LIGHTSPEED_PREFER_RHSSO_AUTH = "true";
    const { user } = mkUser();
    await expect(user.getAuthProviderOrder()).resolves.toEqual([
      AuthProviderType.rhsso,
      AuthProviderType.lightspeed,
    ]);
  });

  it("prefers the previously-used lightspeed provider first", async () => {
    getExtensionMock.mockReturnValue({});
    const { user } = mkUser();
    P(user)._userType = AuthProviderType.lightspeed;
    await expect(user.getAuthProviderOrder()).resolves.toEqual([
      AuthProviderType.lightspeed,
      AuthProviderType.rhsso,
    ]);
  });

  it("prefers the previously-used rhsso provider first", async () => {
    getExtensionMock.mockReturnValue({});
    const { user } = mkUser();
    P(user)._userType = AuthProviderType.rhsso;
    await expect(user.getAuthProviderOrder()).resolves.toEqual([
      AuthProviderType.rhsso,
      AuthProviderType.lightspeed,
    ]);
  });

  it("falls back to [lightspeed, rhsso] when resolving the base URI throws", async () => {
    getExtensionMock.mockReturnValue({});
    getBaseUriMock.mockRejectedValue(new Error("boom"));
    const { user } = mkUser();
    await expect(user.getAuthProviderOrder()).resolves.toEqual([
      AuthProviderType.lightspeed,
      AuthProviderType.rhsso,
    ]);
  });

  it("prefers RHSSO on Remote prod with an unsupported callback", async () => {
    getExtensionMock.mockReturnValue({});
    getBaseUriMock.mockResolvedValue("https://c.ai.ansible.redhat.com");
    vi.spyOn(
      LightSpeedAuthenticationProvider,
      "getExternalRedirectUri",
    ).mockResolvedValue({
      scheme: "https",
      authority: "example.com",
      toString: () => "https://example.com",
    } as unknown as vscode.Uri);
    const { user } = mkUser({
      extensionKind: vscode.ExtensionKind.Workspace,
      navigatorDefined: false,
    });
    await expect(user.getAuthProviderOrder()).resolves.toEqual([
      AuthProviderType.rhsso,
      AuthProviderType.lightspeed,
    ]);
  });

  it("prefers lightspeed on Remote prod with a supported callback", async () => {
    getExtensionMock.mockReturnValue({});
    getBaseUriMock.mockResolvedValue("https://c.ai.ansible.redhat.com");
    vi.spyOn(
      LightSpeedAuthenticationProvider,
      "getExternalRedirectUri",
    ).mockResolvedValue({
      scheme: "vscode",
      authority: "",
      toString: () => "vscode://callback",
    } as unknown as vscode.Uri);
    const { user } = mkUser({
      extensionKind: vscode.ExtensionKind.Workspace,
      navigatorDefined: false,
    });
    await expect(user.getAuthProviderOrder()).resolves.toEqual([
      AuthProviderType.lightspeed,
      AuthProviderType.rhsso,
    ]);
  });
});

describe("LightspeedUser.updateUserInformation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invokes _updateUserInformation when a session is present", async () => {
    const { user } = mkUser();
    const session = fakeSession("s");
    P(user)._session = session;
    const spy = vi
      .spyOn(P(user), "_updateUserInformation")
      .mockResolvedValue(true);
    await user.updateUserInformation();
    expect(spy).toHaveBeenCalledWith(false, session);
  });

  it("does nothing when there is no session", async () => {
    const { user } = mkUser();
    const spy = vi
      .spyOn(P(user), "_updateUserInformation")
      .mockResolvedValue(true);
    await user.updateUserInformation();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("LightspeedUser._updateUserInformation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBaseUriMock.mockResolvedValue("https://x");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sets details and returns true on full success", async () => {
    const { user } = mkUser();
    vi.spyOn(user, "getUserInfo").mockResolvedValue(fullUserInfo());
    vi.spyOn(user, "getUserInfoFromMarkdown").mockResolvedValue("md");
    const session = fakeSession("s");

    const ok = await P(user)._updateUserInformation(false, session);

    expect(ok).toBe(true);
    expect(P(user)._userDetails).toBeDefined();
    expect(P(user)._markdownUserDetails).toBe("md");
  });

  it("uses an empty markdown string when the markdown fetch throws", async () => {
    const { user } = mkUser();
    vi.spyOn(user, "getUserInfo").mockResolvedValue(fullUserInfo());
    vi.spyOn(user, "getUserInfoFromMarkdown").mockRejectedValue(
      new Error("md boom"),
    );
    const session = fakeSession("s");

    const ok = await P(user)._updateUserInformation(false, session);

    expect(ok).toBe(true);
    expect(P(user)._markdownUserDetails).toBe("");
  });

  it("forces a new session on access-denied when createIfNone and a user type are set", async () => {
    const { user } = mkUser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mkRes({ ok: false, status: 401 })),
    );
    P(user)._userType = AuthProviderType.rhsso;
    const session = fakeSession("s");

    const ok = await P(user)._updateUserInformation(true, session);

    expect(ok).toBe(false);
    expect(getSessionMock).toHaveBeenCalledWith(
      AuthProviderType.rhsso,
      ["api.lightspeed"],
      { forceNewSession: true },
    );
  });

  it("removes the lightspeed session on access-denied without createIfNone", async () => {
    const authProvider = {
      removeSession: vi.fn(),
      refreshAccessToken: vi.fn(),
    };
    const { user } = mkUser({ authProvider });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mkRes({ ok: false, status: 401 })),
    );
    P(user)._userType = AuthProviderType.lightspeed;
    const session = fakeSession("sess-1");

    const ok = await P(user)._updateUserInformation(false, session);

    expect(ok).toBe(false);
    expect(authProvider.removeSession).toHaveBeenCalledWith("sess-1");
  });
});

describe("LightspeedUser.getLightspeedUserDetails", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns undefined when the service is disabled", async () => {
    const { user } = mkUser({ enabled: false });
    await expect(user.getLightspeedUserDetails(false)).resolves.toBeUndefined();
  });

  it("returns undefined for an LLM provider when not explicitly authenticating", async () => {
    const { user } = mkUser({ provider: "ollama" });
    await expect(user.getLightspeedUserDetails(false)).resolves.toBeUndefined();
  });

  it("returns cached details and refreshes on a provider-type mismatch", async () => {
    const { user } = mkUser({ provider: "wca" });
    const cached = {
      rhOrgHasSubscription: true,
      rhUserIsOrgAdmin: false,
      displayName: "ext",
      displayNameWithUserType: "ext (licensed)",
      orgOptOutTelemetry: false,
    };
    P(user)._userDetails = cached;
    P(user)._userType = AuthProviderType.lightspeed;
    const spy = vi.spyOn(P(user), "setLightspeedUser").mockResolvedValue();

    await expect(user.getLightspeedUserDetails(false)).resolves.toBe(cached);
    expect(spy).not.toHaveBeenCalled();

    await user.getLightspeedUserDetails(false, AuthProviderType.rhsso);
    expect(spy).toHaveBeenCalled();
  });
});

describe("LightspeedUser.getMarkdownLightspeedUserDetails", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns undefined when the service is disabled", async () => {
    const { user } = mkUser({ enabled: false });
    await expect(
      user.getMarkdownLightspeedUserDetails(false),
    ).resolves.toBeUndefined();
  });

  it("returns the cached markdown without refreshing", async () => {
    const { user } = mkUser();
    P(user)._markdownUserDetails = "cached-md";
    P(user)._userType = AuthProviderType.lightspeed;
    const spy = vi.spyOn(P(user), "setLightspeedUser").mockResolvedValue();

    await expect(user.getMarkdownLightspeedUserDetails(false)).resolves.toBe(
      "cached-md",
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("LightspeedUser.getLightspeedUserContent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty string when no markdown details exist", async () => {
    const { user } = mkUser();
    vi.spyOn(P(user), "setLightspeedUser").mockResolvedValue();
    await expect(user.getLightspeedUserContent()).resolves.toBe("");
  });
});

describe("LightspeedUser.rhOrgHasSubscription", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns undefined when no user details are available", async () => {
    const { user } = mkUser();
    vi.spyOn(user, "getLightspeedUserDetails").mockResolvedValue(undefined);
    await expect(user.rhOrgHasSubscription()).resolves.toBeUndefined();
  });

  it("returns true when the org has a subscription", async () => {
    const { user } = mkUser();
    vi.spyOn(user, "getLightspeedUserDetails").mockResolvedValue({
      rhOrgHasSubscription: true,
      displayNameWithUserType: "ext (licensed)",
    } as never);
    await expect(user.rhOrgHasSubscription()).resolves.toBe(true);
  });

  it("returns false when the org has no subscription", async () => {
    const { user } = mkUser();
    vi.spyOn(user, "getLightspeedUserDetails").mockResolvedValue({
      rhOrgHasSubscription: false,
      displayNameWithUserType: "ext (unlicensed)",
    } as never);
    await expect(user.rhOrgHasSubscription()).resolves.toBe(false);
  });
});

describe("LightspeedUser.getLightspeedUserAccessToken", () => {
  let savedTestToken: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    savedTestToken = process.env.TEST_LIGHTSPEED_ACCESS_TOKEN;
    delete process.env.TEST_LIGHTSPEED_ACCESS_TOKEN;
  });
  afterEach(() => {
    if (savedTestToken === undefined) {
      delete process.env.TEST_LIGHTSPEED_ACCESS_TOKEN;
    } else {
      process.env.TEST_LIGHTSPEED_ACCESS_TOKEN = savedTestToken;
    }
  });

  it("returns the TEST_LIGHTSPEED_ACCESS_TOKEN when set", async () => {
    process.env.TEST_LIGHTSPEED_ACCESS_TOKEN = "env-token";
    const { user } = mkUser();
    await expect(user.getLightspeedUserAccessToken()).resolves.toBe(
      "env-token",
    );
  });

  it("returns undefined for an LLM provider", async () => {
    const { user } = mkUser({ provider: "ollama" });
    await expect(user.getLightspeedUserAccessToken()).resolves.toBeUndefined();
  });

  it("triggers the auth request command when the user selects Login", async () => {
    const { user } = mkUser();
    showWarningMock.mockResolvedValue("Login");
    await user.getLightspeedUserAccessToken();
    expect(executeCommandMock).toHaveBeenCalledWith(
      LightSpeedCommands.LIGHTSPEED_AUTH_REQUEST,
    );
  });

  it("opens settings when the user selects Disable Lightspeed", async () => {
    const { user } = mkUser();
    showWarningMock.mockResolvedValue("Disable Lightspeed");
    await user.getLightspeedUserAccessToken();
    expect(executeCommandMock).toHaveBeenCalledWith(
      "workbench.action.openSettings",
      "ansible.lightspeed.enabled",
    );
  });

  it("refreshes the token via the provider for a lightspeed session", async () => {
    const authProvider = {
      removeSession: vi.fn(),
      refreshAccessToken: vi.fn().mockResolvedValue("ls-token"),
    };
    const { user } = mkUser({ authProvider });
    P(user)._session = fakeSession("s");
    P(user)._userType = AuthProviderType.lightspeed;
    await expect(user.getLightspeedUserAccessToken()).resolves.toBe("ls-token");
    expect(authProvider.refreshAccessToken).toHaveBeenCalled();
  });

  it("returns the session access token for an rhsso session", async () => {
    const { user } = mkUser();
    const session = fakeSession("rh");
    P(user)._session = session;
    P(user)._userType = AuthProviderType.rhsso;
    await expect(user.getLightspeedUserAccessToken()).resolves.toBe(
      session.accessToken,
    );
  });
});

describe("LightspeedUser.isAuthenticated", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when a session is present", async () => {
    const { user } = mkUser();
    P(user)._session = fakeSession("s");
    await expect(user.isAuthenticated()).resolves.toBe(true);
  });

  it("returns false when no session is present", async () => {
    const { user } = mkUser();
    await expect(user.isAuthenticated()).resolves.toBe(false);
  });
});
