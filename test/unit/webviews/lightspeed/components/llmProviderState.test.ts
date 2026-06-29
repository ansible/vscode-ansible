import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { useProviderSettings } from "@webviews/lightspeed/src/components/llmProviderState";
import { vscodeApi } from "@webviews/lightspeed/src/utils/vscode";

type ProviderSettings = ReturnType<typeof useProviderSettings>;

interface MountedComposable {
  api: ProviderSettings;
  handleMessage: (event: MessageEvent) => void;
  unmount: () => void;
}

const mockProviders = [
  {
    type: "google",
    name: "google",
    displayName: "Google Gemini",
    description: "Test provider",
    defaultEndpoint: "https://default.example.com",
    configSchema: [
      {
        key: "apiEndpoint",
        label: "Endpoint",
        type: "string",
        required: true,
        placeholder: "",
        description: "",
      },
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "",
        description: "",
      },
    ],
  },
  {
    type: "wca",
    name: "wca",
    displayName: "IBM watsonx",
    description: "Test provider",
    defaultEndpoint: "https://wca.example.com",
    configSchema: [
      {
        key: "apiEndpoint",
        label: "Endpoint",
        type: "string",
        required: true,
        placeholder: "",
        description: "",
      },
    ],
  },
];

// Mount the composable inside a throwaway component so onMounted runs.
// We capture the window "message" handler by spying on addEventListener,
// which also prevents leaking real listeners across tests.
function mountComposable(): MountedComposable {
  let captured: ((event: MessageEvent) => void) | null = null;
  const addEventListenerSpy = vi
    .spyOn(window, "addEventListener")
    .mockImplementation((event, handler) => {
      if (event === "message") {
        captured = handler as (event: MessageEvent) => void;
      }
    });

  let api!: ProviderSettings;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useProviderSettings();
        return () => h("div");
      },
    }),
  );

  addEventListenerSpy.mockRestore();

  return {
    api,
    handleMessage: (event: MessageEvent) => captured?.(event),
    unmount: () => wrapper.unmount(),
  };
}

function sendMessage(c: MountedComposable, data: unknown) {
  c.handleMessage({ data } as MessageEvent);
}

describe("useProviderSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requests provider settings and registers a message listener on mount", () => {
    const c = mountComposable();
    expect(vscodeApi.postMessage).toHaveBeenCalledWith({
      command: "getProviderSettings",
    });
    expect(c.handleMessage).toBeDefined();
    c.unmount();
  });

  describe("setConfigValue", () => {
    it("lazily creates the provider config object before setting a value", () => {
      const c = mountComposable();
      // No config exists for "google" yet.
      expect(c.api.getConfigValue("google", "apiKey")).toBe("");

      c.api.setConfigValue("google", "apiKey", "secret");

      expect(c.api.getConfigValue("google", "apiKey")).toBe("secret");
      c.unmount();
    });
  });

  describe("showSaveIndicator", () => {
    it("shows the indicator then hides it after 2000ms", () => {
      vi.useFakeTimers();
      const c = mountComposable();

      expect(c.api.saveIndicatorVisible.value).toBe(false);

      // setActiveProvider triggers showSaveIndicator internally.
      c.api.setActiveProvider("google");
      expect(c.api.saveIndicatorVisible.value).toBe(true);

      vi.advanceTimersByTime(1999);
      expect(c.api.saveIndicatorVisible.value).toBe(true);

      vi.advanceTimersByTime(1);
      expect(c.api.saveIndicatorVisible.value).toBe(false);
      c.unmount();
    });
  });

  describe("toggleEdit", () => {
    it("initializes config from schema using the endpoint default", () => {
      const c = mountComposable();
      c.api.providers.value = mockProviders;

      c.api.toggleEdit("google");

      expect(c.api.editingProvider.value).toBe("google");
      // apiEndpoint defaults to defaultEndpoint, other fields empty.
      expect(c.api.getConfigValue("google", "apiEndpoint")).toBe(
        "https://default.example.com",
      );
      expect(c.api.getConfigValue("google", "apiKey")).toBe("");
      // Snapshot stored -> no unsaved changes right after opening.
      expect(c.api.hasUnsavedChanges("google")).toBe(false);
      c.unmount();
    });

    it("restores the original config when closing the edit panel", () => {
      const c = mountComposable();
      c.api.providers.value = mockProviders;

      c.api.toggleEdit("google");
      c.api.setConfigValue("google", "apiKey", "changed");
      expect(c.api.hasUnsavedChanges("google")).toBe(true);

      // Toggling the same provider closes and restores.
      c.api.toggleEdit("google");

      expect(c.api.editingProvider.value).toBeNull();
      expect(c.api.getConfigValue("google", "apiKey")).toBe("");
      c.unmount();
    });

    it("discards another provider's unsaved changes when switching", () => {
      const c = mountComposable();
      c.api.providers.value = mockProviders;

      c.api.toggleEdit("google");
      c.api.setConfigValue("google", "apiKey", "dirty");

      // Switch to a different provider without saving google.
      c.api.toggleEdit("wca");

      expect(c.api.editingProvider.value).toBe("wca");
      expect(c.api.getConfigValue("google", "apiKey")).toBe("");
      c.unmount();
    });
  });

  describe("saveProviderConfig", () => {
    it("returns early for an unknown provider with no config", () => {
      const c = mountComposable();
      c.api.providers.value = mockProviders;
      vi.mocked(vscodeApi.postMessage).mockClear();

      c.api.saveProviderConfig("does-not-exist");

      expect(vscodeApi.postMessage).not.toHaveBeenCalled();
      c.unmount();
    });

    it("sends saveProviderSettings and resets connection status when config changed", () => {
      const c = mountComposable();
      sendMessage(c, {
        command: "providerSettings",
        providers: mockProviders,
        currentProvider: "google",
        providerConfigs: {
          google: { apiEndpoint: "https://default.example.com", apiKey: "old" },
          wca: { apiEndpoint: "https://wca.example.com" },
        },
        connectionStatuses: { google: true, wca: false },
      });

      expect(c.api.isConnected("google")).toBe(true);

      c.api.toggleEdit("google");
      c.api.setConfigValue("google", "apiKey", "new-key");
      expect(c.api.hasUnsavedChanges("google")).toBe(true);

      vi.mocked(vscodeApi.postMessage).mockClear();
      c.api.saveProviderConfig("google");

      expect(vscodeApi.postMessage).toHaveBeenCalledWith({
        command: "saveProviderSettings",
        provider: "google",
        config: expect.objectContaining({ apiKey: "new-key" }),
      });
      expect(c.api.isConnected("google")).toBe(false);
      c.unmount();
    });
  });

  describe("handleMessage", () => {
    it("ignores non-record data", () => {
      const c = mountComposable();
      expect(c.api.isLoading.value).toBe(true);

      sendMessage(c, "not-an-object");
      sendMessage(c, null);

      expect(c.api.isLoading.value).toBe(true);
      c.unmount();
    });

    it("ignores messages without a string command", () => {
      const c = mountComposable();
      expect(c.api.isLoading.value).toBe(true);

      sendMessage(c, { foo: "bar" });

      expect(c.api.isLoading.value).toBe(true);
      c.unmount();
    });

    it("handles a failed connectionResult by setting status false and logging", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const c = mountComposable();
      sendMessage(c, {
        command: "providerSettings",
        providers: mockProviders,
        currentProvider: "google",
        providerConfigs: { google: {}, wca: {} },
        connectionStatuses: { google: true, wca: false },
      });

      sendMessage(c, {
        command: "connectionResult",
        provider: "google",
        connected: false,
        error: "Invalid key",
      });

      expect(c.api.isConnected("google")).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Connection failed for google"),
      );
      consoleSpy.mockRestore();
      c.unmount();
    });
  });

  describe("hasUnsavedChanges false branches", () => {
    it("returns false for an unknown provider (no provider info)", () => {
      const c = mountComposable();
      c.api.providers.value = mockProviders;
      expect(c.api.hasUnsavedChanges("unknown")).toBe(false);
      c.unmount();
    });

    it("returns false when there is no current/original config", () => {
      const c = mountComposable();
      c.api.providers.value = mockProviders;
      // providers known but configs never initialized -> current/original undefined.
      expect(c.api.hasUnsavedChanges("google")).toBe(false);
      c.unmount();
    });
  });
});
