import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MODEL_NAMES,
  TEST_API_KEYS,
  API_ENDPOINTS,
  DEFAULT_TIMEOUTS,
} from "../testConstants.js";
import {
  OpenAICompatibleClient,
  OpenAIClientError,
} from "../../../../src/features/lightspeed/clients/openaiCompatibleClient.js";

vi.mock("../../../../src/utils/logger", () => {
  const loggerMock = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  };
  return {
    getLightspeedLogger: vi.fn(() => loggerMock),
  };
});

const mockFetch = vi.fn();
vi.mock("../../../../src/features/lightspeed/api", () => ({
  getFetch: vi.fn(() => mockFetch),
}));

describe("OpenAICompatibleClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create client with valid config", () => {
    const client = new OpenAICompatibleClient({
      baseUrl: API_ENDPOINTS.RHCUSTOM_LOCAL,
      apiKey: TEST_API_KEYS.TEST_KEY,
      model: MODEL_NAMES.TEST_MODEL,
      timeout: DEFAULT_TIMEOUTS.DEFAULT,
    });

    expect(client).toBeInstanceOf(OpenAICompatibleClient);
  });

  it("should return successful response from chatCompletion", async () => {
    const mockResponse = {
      id: "test-completion-123",
      object: "chat.completion",
      created: 1234567890,
      model: MODEL_NAMES.TEST_MODEL,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello!" },
          finish_reason: "stop",
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const client = new OpenAICompatibleClient({
      baseUrl: API_ENDPOINTS.RHCUSTOM_LOCAL,
      apiKey: TEST_API_KEYS.TEST_KEY,
      model: MODEL_NAMES.TEST_MODEL,
    });

    const result = await client.chatCompletion([
      { role: "user", content: "Hi" },
    ]);

    expect(result).toEqual(mockResponse);
  });

  it("should throw OpenAIClientError on HTTP 401", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: "Invalid API key" } }),
    });

    const client = new OpenAICompatibleClient({
      baseUrl: API_ENDPOINTS.RHCUSTOM_LOCAL,
      apiKey: "invalid-key",
      model: MODEL_NAMES.TEST_MODEL,
    });

    try {
      await client.chatCompletion([{ role: "user", content: "Hi" }]);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenAIClientError);
      expect((error as OpenAIClientError).status).toBe(401);
    }
  });

  it("should throw OpenAIClientError on timeout", async () => {
    mockFetch.mockImplementation(
      () =>
        new Promise((_, reject) => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        }),
    );

    const client = new OpenAICompatibleClient({
      baseUrl: API_ENDPOINTS.RHCUSTOM_LOCAL,
      apiKey: TEST_API_KEYS.TEST_KEY,
      model: MODEL_NAMES.TEST_MODEL,
      timeout: 100,
    });

    try {
      await client.chatCompletion([{ role: "user", content: "Hi" }]);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenAIClientError);
      expect((error as OpenAIClientError).status).toBe(408);
    }
  });

  it("should re-throw network errors", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    const client = new OpenAICompatibleClient({
      baseUrl: API_ENDPOINTS.RHCUSTOM_LOCAL,
      apiKey: TEST_API_KEYS.TEST_KEY,
      model: MODEL_NAMES.TEST_MODEL,
    });

    await expect(
      client.chatCompletion([{ role: "user", content: "Hi" }]),
    ).rejects.toThrow("Network failure");
  });
});
