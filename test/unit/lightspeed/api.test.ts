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
import { LightSpeedAPI, getFetch } from "@src/features/lightspeed/api";
import type { LightspeedUser } from "@src/features/lightspeed/lightspeedUser";
import type { SettingsManager } from "@src/settings";
import type {
  CompletionRequestParams,
  FeedbackRequestParams,
  ContentMatchesRequestParams,
  ExplanationRequestParams,
  PlaybookGenerationRequestParams,
  RoleGenerationRequestParams,
  RoleExplanationRequestParams,
} from "@src/interfaces/lightspeed";

// Shared mocks created in the hoisted scope so the vi.mock factories below can
// reference them (vi.mock is hoisted above imports).
const h = vi.hoisted(() => ({
  getBaseUri: vi.fn(),
  mapError: vi.fn(),
  inlineHide: vi.fn(),
  trialProvider: { showPopup: vi.fn() },
}));

// Keep the real webUtils constants (auth ids etc.) and override getBaseUri only.
vi.mock("@src/features/lightspeed/utils/webUtils", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@src/features/lightspeed/utils/webUtils")
    >();
  return { ...actual, getBaseUri: h.getBaseUri };
});

vi.mock("@src/features/lightspeed/handleApiError", () => ({
  mapError: h.mapError,
}));

vi.mock("@src/features/lightspeed/inlineSuggestions", () => ({
  inlineSuggestionHideHandler: h.inlineHide,
}));

vi.mock("@src/features/lightspeed/utils/oneClickTrial", () => ({
  getOneClickTrialProvider: () => h.trialProvider,
  OneClickTrialProvider: class {},
}));

type MockResponse = {
  ok: boolean;
  status: number;
  json: Mock;
};

function makeRes(opts: {
  ok?: boolean;
  status?: number;
  json?: unknown;
}): MockResponse {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    json: vi.fn().mockResolvedValue(opts.json ?? {}),
  };
}

const showInfo = vscode.window.showInformationMessage as unknown as Mock;
const showError = vscode.window.showErrorMessage as unknown as Mock;

interface MkApiOpts {
  provider?: string;
  authed?: boolean;
  optOut?: boolean;
  token?: string | undefined;
  packageJSON?: { version?: string };
}

function mkApi(opts?: MkApiOpts) {
  const settingsManager = {
    settings: {
      lightSpeedService: {
        provider: opts?.provider ?? "wca",
      },
    },
  } as unknown as SettingsManager;

  const user = {
    isAuthenticated: vi.fn().mockResolvedValue(opts?.authed ?? true),
    orgOptOutTelemetry: vi.fn().mockResolvedValue(opts?.optOut ?? false),
    getLightspeedUserAccessToken: vi
      .fn()
      .mockResolvedValue("token" in (opts ?? {}) ? opts?.token : "tok"),
  } as unknown as LightspeedUser & {
    isAuthenticated: Mock;
    orgOptOutTelemetry: Mock;
    getLightspeedUserAccessToken: Mock;
  };

  const context = {
    extension: { packageJSON: opts?.packageJSON ?? { version: "9.9.9" } },
  } as unknown as vscode.ExtensionContext;

  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  };

  const api = new LightSpeedAPI(
    settingsManager,
    user,
    context,
    logger as unknown as never,
  );
  return { api, user, settingsManager, logger };
}

let fetchMock: Mock;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  h.getBaseUri.mockResolvedValue("https://base");
  h.mapError.mockReturnValue({ code: "mapped", message: "Mapped error" });
  h.trialProvider.showPopup.mockResolvedValue(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getFetch", () => {
  it("falls back to globalThis.fetch when electron is unavailable", () => {
    // electron require resolves to a path string (no .net.fetch) -> fallback.
    expect(getFetch()).toBe(fetchMock);
  });
});

describe("LightSpeedAPI.lightspeedPost (via completionRequest)", () => {
  it("throws an auth error for the WCA provider when no token is available", async () => {
    const { api } = mkApi({ provider: "wca", token: undefined });
    const result = await api.completionRequest({
      prompt: "p",
      suggestionId: "s1",
    } as unknown as CompletionRequestParams);

    // The thrown error is caught by completionRequest and mapped.
    expect(h.mapError).toHaveBeenCalledTimes(1);
    expect((h.mapError.mock.calls[0][0] as Error).message).toBe(
      "Ansible Lightspeed authentication failed.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it("adds an Authorization header when a token is present", async () => {
    const { api } = mkApi({ provider: "wca", token: "tok" });
    fetchMock.mockResolvedValue(
      makeRes({ json: { predictions: [{ prediction: "x" }] } }),
    );

    await api.completionRequest({
      prompt: "p",
      suggestionId: "s1",
    } as unknown as CompletionRequestParams);

    const headers = fetchMock.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer tok");
  });

  it("omits the Authorization header for a non-WCA provider with no token", async () => {
    const { api } = mkApi({ provider: "ollama", token: undefined });
    fetchMock.mockResolvedValue(
      makeRes({ json: { predictions: [{ prediction: "x" }] } }),
    );

    await api.completionRequest({
      prompt: "p",
      suggestionId: "s1",
    } as unknown as CompletionRequestParams);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBeUndefined();
  });
});

describe("LightSpeedAPI.completionRequest", () => {
  it("returns the predictions payload on success", async () => {
    const { api } = mkApi();
    fetchMock.mockResolvedValue(
      makeRes({ json: { predictions: [{ prediction: "do thing" }] } }),
    );

    const result = await api.completionRequest({
      prompt: "p",
      suggestionId: "s1",
    } as unknown as CompletionRequestParams);

    expect(result).toEqual({ predictions: [{ prediction: "do thing" }] });
    // The feedback for this suggestion is still pending, so the finally branch
    // treats it as cancelled and does NOT call the hide handler.
    expect(h.inlineHide).not.toHaveBeenCalled();
  });

  it("calls inlineSuggestionHideHandler when the feedback was cancelled mid-flight", async () => {
    const { api } = mkApi();
    const res = makeRes({ json: { predictions: [{ prediction: "x" }] } });
    // Cancel the pending feedback while awaiting json() so that, by the time the
    // finally block runs, the suggestion is no longer tracked.
    res.json.mockImplementation(async () => {
      api.cancelSuggestionFeedback("s1");
      return { predictions: [{ prediction: "x" }] };
    });
    fetchMock.mockResolvedValue(res);

    await api.completionRequest({
      prompt: "p",
      suggestionId: "s1",
    } as unknown as CompletionRequestParams);

    expect(h.inlineHide).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["204 status", { ok: true, status: 204, json: {} }],
    ["empty predictions", { ok: true, status: 200, json: { predictions: [] } }],
    [
      "null first prediction",
      { ok: true, status: 200, json: { predictions: [null] } },
    ],
  ])("shows an info message for %s and returns {}", async (_label, resOpts) => {
    const { api } = mkApi();
    fetchMock.mockResolvedValue(makeRes(resOpts));

    const result = await api.completionRequest({
      prompt: "p",
      suggestionId: "s1",
    } as unknown as CompletionRequestParams);

    expect(showInfo).toHaveBeenCalledTimes(1);
    expect(result).toEqual({});
  });

  it("shows an error message on a non-ok response when the trial popup is not shown", async () => {
    const { api } = mkApi();
    h.trialProvider.showPopup.mockResolvedValue(false);
    fetchMock.mockResolvedValue(makeRes({ ok: false, status: 500, json: {} }));

    const result = await api.completionRequest({
      prompt: "p",
      suggestionId: "s1",
    } as unknown as CompletionRequestParams);

    expect(showError).toHaveBeenCalledTimes(1);
    expect(result).toEqual({});
  });

  it("does not show an error message when the trial popup is shown", async () => {
    const { api } = mkApi();
    h.trialProvider.showPopup.mockResolvedValue(true);
    fetchMock.mockResolvedValue(makeRes({ ok: false, status: 403, json: {} }));

    await api.completionRequest({
      prompt: "p",
      suggestionId: "s1",
    } as unknown as CompletionRequestParams);

    expect(showError).not.toHaveBeenCalled();
  });

  it('pushes "" to the feedback queue when no suggestionId is supplied', async () => {
    const { api } = mkApi();
    let inProgressDuringRequest = false;
    const res = makeRes({ json: { predictions: [{ prediction: "x" }] } });
    res.json.mockImplementation(async () => {
      inProgressDuringRequest = api.isSuggestionFeedbackInProgress();
      return { predictions: [{ prediction: "x" }] };
    });
    fetchMock.mockResolvedValue(res);

    await api.completionRequest({
      prompt: "p",
    } as unknown as CompletionRequestParams);

    expect(inProgressDuringRequest).toBe(true);
  });
});

describe("LightSpeedAPI.cancelSuggestionFeedback", () => {
  it("returns true when the suggestion is found and false otherwise", () => {
    const { api } = mkApi();
    (
      api as unknown as { _suggestionFeedbacks: string[] }
    )._suggestionFeedbacks.push("abc");
    expect(api.cancelSuggestionFeedback("abc")).toBe(true);
    expect(api.cancelSuggestionFeedback("abc")).toBe(false);
  });
});

describe("LightSpeedAPI.feedbackRequest", () => {
  it("returns {} without fetching when unauthenticated and not showing auth errors", async () => {
    const { api } = mkApi({ authed: false });

    const result = await api.feedbackRequest({
      inlineSuggestion: { latency: 1 },
    } as unknown as FeedbackRequestParams);

    expect(result).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("strips inlineSuggestion on org opt-out and returns early when nothing remains", async () => {
    const { api } = mkApi({ authed: true, optOut: true });
    const inputData = {
      inlineSuggestion: { latency: 1 },
    } as unknown as FeedbackRequestParams;

    const result = await api.feedbackRequest(inputData);

    expect(result).toEqual({});
    expect(inputData.inlineSuggestion).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a thank-you message on success when showInfoMessage is true", async () => {
    const { api } = mkApi({ authed: true });
    fetchMock.mockResolvedValue(makeRes({ json: {} }));

    await api.feedbackRequest(
      { sentimentFeedback: { value: 5 } } as unknown as FeedbackRequestParams,
      false,
      true,
    );

    expect(showInfo).toHaveBeenCalledWith("Thanks for your feedback!");
  });

  it("shows an error message on failure when showInfoMessage is true", async () => {
    const { api } = mkApi({ authed: true });
    fetchMock.mockResolvedValue(makeRes({ ok: false, status: 400, json: {} }));

    await api.feedbackRequest(
      { sentimentFeedback: { value: 5 } } as unknown as FeedbackRequestParams,
      false,
      true,
    );

    expect(showError).toHaveBeenCalledTimes(1);
  });

  it("logs to console.error on failure when showInfoMessage is false", async () => {
    const { api } = mkApi({ authed: true });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    fetchMock.mockResolvedValue(makeRes({ ok: false, status: 400, json: {} }));

    await api.feedbackRequest(
      { sentimentFeedback: { value: 5 } } as unknown as FeedbackRequestParams,
      false,
      false,
    );

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(showError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("LightSpeedAPI.contentMatchesRequest", () => {
  it("shows an error and returns {} when unauthenticated", async () => {
    const { api } = mkApi({ authed: false });

    const result = await api.contentMatchesRequest({
      suggestions: ["x"],
    } as unknown as ContentMatchesRequestParams);

    expect(showError).toHaveBeenCalledTimes(1);
    expect(result).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the data on success", async () => {
    const { api } = mkApi({ authed: true });
    fetchMock.mockResolvedValue(makeRes({ json: { contentmatches: [] } }));

    const result = await api.contentMatchesRequest({
      suggestions: ["x"],
    } as unknown as ContentMatchesRequestParams);

    expect(result).toEqual({ contentmatches: [] });
  });

  it("returns a mapped IError on a non-ok response", async () => {
    const { api } = mkApi({ authed: true });
    fetchMock.mockResolvedValue(makeRes({ ok: false, status: 500, json: {} }));

    const result = await api.contentMatchesRequest({
      suggestions: ["x"],
    } as unknown as ContentMatchesRequestParams);

    expect(result).toEqual({ code: "mapped", message: "Mapped error" });
  });
});

describe("LightSpeedAPI.explanationRequest", () => {
  it("returns the data on success", async () => {
    const { api } = mkApi();
    fetchMock.mockResolvedValue(makeRes({ json: { content: "explained" } }));

    const result = await api.explanationRequest({
      content: "yaml",
    } as unknown as ExplanationRequestParams);

    expect(result).toEqual({ content: "explained" });
  });

  it("returns a mapped IError on a non-ok response", async () => {
    const { api } = mkApi();
    fetchMock.mockResolvedValue(makeRes({ ok: false, status: 500, json: {} }));

    const result = await api.explanationRequest({
      content: "yaml",
    } as unknown as ExplanationRequestParams);

    expect(result).toEqual({ code: "mapped", message: "Mapped error" });
  });
});

describe("LightSpeedAPI.playbookGenerationRequest", () => {
  it("returns the data on success", async () => {
    const { api } = mkApi();
    fetchMock.mockResolvedValue(makeRes({ json: { playbook: "yaml" } }));

    const result = await api.playbookGenerationRequest({
      text: "do thing",
    } as unknown as PlaybookGenerationRequestParams);

    expect(result).toEqual({ playbook: "yaml" });
  });

  it("returns a mapped IError on a non-ok response", async () => {
    const { api } = mkApi();
    fetchMock.mockResolvedValue(makeRes({ ok: false, status: 500, json: {} }));

    const result = await api.playbookGenerationRequest({
      text: "do thing",
    } as unknown as PlaybookGenerationRequestParams);

    expect(result).toEqual({ code: "mapped", message: "Mapped error" });
  });
});

describe("LightSpeedAPI.roleGenerationRequest", () => {
  it("backfills name from role when name is missing", async () => {
    const { api } = mkApi();
    fetchMock.mockResolvedValue(makeRes({ json: { role: "r" } }));

    const result = await api.roleGenerationRequest({
      text: "t",
    } as unknown as RoleGenerationRequestParams);

    expect(result).toEqual({ role: "r", name: "r" });
  });

  it("does not backfill when name is already present", async () => {
    const { api } = mkApi();
    fetchMock.mockResolvedValue(makeRes({ json: { name: "n" } }));

    const result = await api.roleGenerationRequest({
      text: "t",
    } as unknown as RoleGenerationRequestParams);

    expect(result).toEqual({ name: "n" });
  });

  it("returns a mapped IError on a non-ok response", async () => {
    const { api } = mkApi();
    fetchMock.mockResolvedValue(makeRes({ ok: false, status: 500, json: {} }));

    const result = await api.roleGenerationRequest({
      text: "t",
    } as unknown as RoleGenerationRequestParams);

    expect(result).toEqual({ code: "mapped", message: "Mapped error" });
  });
});

describe("LightSpeedAPI.roleExplanationRequest", () => {
  it("returns the data on success", async () => {
    const { api } = mkApi();
    fetchMock.mockResolvedValue(makeRes({ json: { content: "role doc" } }));

    const result = await api.roleExplanationRequest({
      files: [],
    } as unknown as RoleExplanationRequestParams);

    expect(result).toEqual({ content: "role doc" });
  });

  it("returns a mapped IError on a non-ok response", async () => {
    const { api } = mkApi();
    fetchMock.mockResolvedValue(makeRes({ ok: false, status: 500, json: {} }));

    const result = await api.roleExplanationRequest({
      files: [],
    } as unknown as RoleExplanationRequestParams);

    expect(result).toEqual({ code: "mapped", message: "Mapped error" });
  });
});

describe("LightSpeedAPI.getStatus", () => {
  it("reports connected when completionRequest resolves", async () => {
    const { api } = mkApi();
    vi.spyOn(api, "completionRequest").mockResolvedValue({} as never);

    const status = await api.getStatus();

    expect(status.connected).toBe(true);
    expect(status.modelInfo?.name).toBe("WCA");
  });

  it("reports the error message when completionRequest throws an Error", async () => {
    const { api } = mkApi();
    vi.spyOn(api, "completionRequest").mockRejectedValue(new Error("boom"));

    const status = await api.getStatus();

    expect(status).toEqual({ connected: false, error: "boom" });
  });

  it("uses a fallback message when completionRequest throws a non-Error", async () => {
    const { api } = mkApi();
    vi.spyOn(api, "completionRequest").mockRejectedValue("nope");

    const status = await api.getStatus();

    expect(status).toEqual({
      connected: false,
      error: "WCA connection failed",
    });
  });
});

describe("LightSpeedAPI constructor", () => {
  it("uses an empty extension version when packageJSON has no version", async () => {
    const { api } = mkApi({ packageJSON: {} });
    fetchMock.mockResolvedValue(
      makeRes({ json: { predictions: [{ prediction: "x" }] } }),
    );

    await api.completionRequest({
      prompt: "p",
      suggestionId: "s1",
    } as unknown as CompletionRequestParams);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      metadata: { ansibleExtensionVersion: string };
    };
    expect(body.metadata.ansibleExtensionVersion).toBe("");
  });
});
