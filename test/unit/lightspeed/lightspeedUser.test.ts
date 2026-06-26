import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import * as vscode from "vscode";
import {
  LightspeedUser,
  AuthProviderType,
} from "@src/features/lightspeed/lightspeedUser";
import * as webUtils from "@src/features/lightspeed/utils/webUtils";

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
