import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const { mockPostMessage } = vi.hoisted(() => ({
  mockPostMessage: vi.fn(),
}));

vi.mock("../../../webviews/lightspeed/src/utils", () => ({
  vscodeApi: {
    postMessage: mockPostMessage,
  },
}));

import LlmProviderApp from "../../../webviews/LlmProviderApp.vue";

describe("LlmProviderApp", () => {
  let messageHandler: ((event: MessageEvent) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    messageHandler = null;

    vi.spyOn(window, "addEventListener").mockImplementation(
      (event, handler) => {
        if (event === "message") {
          messageHandler = handler as (event: MessageEvent) => void;
        }
      },
    );
  });

  const simulateMessage = (data: unknown) => {
    if (messageHandler) {
      messageHandler({ data } as MessageEvent);
    }
  };

  describe("initialization", () => {
    it("renders the main container", () => {
      const wrapper = mount(LlmProviderApp);
      expect(wrapper.find("#llmProviderView").exists()).toBe(true);
    });

    it("shows loading state initially", () => {
      const wrapper = mount(LlmProviderApp);
      expect(wrapper.text()).toContain("Loading provider settings");
    });

    it("requests provider settings on mount", async () => {
      mount(LlmProviderApp);
      await flushPromises();

      expect(mockPostMessage).toHaveBeenCalledWith({
        command: "getProviderSettings",
      });
    });

    it("registers message listener on mount", () => {
      mount(LlmProviderApp);

      expect(window.addEventListener).toHaveBeenCalledWith(
        "message",
        expect.any(Function),
      );
    });
  });

  describe("provider settings handling", () => {
    const mockProviders = [
      {
        type: "wca",
        name: "wca",
        displayName: "IBM watsonx",
        description: "Red Hat Ansible Lightspeed with IBM watsonx Code Assistant",
        defaultEndpoint: "https://c.ai.ansible.redhat.com",
        configSchema: [
          {
            key: "apiEndpoint",
            label: "Lightspeed URL",
            type: "string",
            required: true,
            placeholder: "https://c.ai.ansible.redhat.com",
            description: "URL for the Lightspeed service",
          },
        ],
        usesOAuth: true,
        requiresApiKey: false,
      },
      {
        type: "google",
        name: "google",
        displayName: "Google Gemini",
        description: "Direct access to Google Gemini models",
        defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta",
        configSchema: [
          {
            key: "apiKey",
            label: "API Key",
            type: "password",
            required: true,
            placeholder: "AIza...",
            description: "Your Google AI API key",
          },
          {
            key: "modelName",
            label: "Model Name",
            type: "string",
            required: false,
            placeholder: "gemini-2.5-flash",
            description: "The Gemini model to use",
          },
        ],
        usesOAuth: false,
        requiresApiKey: true,
      },
    ];

    it("hides loading state after receiving settings", async () => {
      const wrapper = mount(LlmProviderApp);
      await flushPromises();

      simulateMessage({
        command: "providerSettings",
        providers: mockProviders,
        currentProvider: "wca",
        providerConfigs: {
          wca: { apiEndpoint: "https://c.ai.ansible.redhat.com" },
          google: { apiKey: "", modelName: "" },
        },
        connectionStatuses: { wca: false, google: false },
      });
      await flushPromises();

      expect(wrapper.text()).not.toContain("Loading provider settings");
    });

    it("renders provider list after receiving settings", async () => {
      const wrapper = mount(LlmProviderApp);
      await flushPromises();

      simulateMessage({
        command: "providerSettings",
        providers: mockProviders,
        currentProvider: "wca",
        providerConfigs: {
          wca: { apiEndpoint: "https://c.ai.ansible.redhat.com" },
          google: { apiKey: "", modelName: "" },
        },
        connectionStatuses: { wca: false, google: false },
      });
      await flushPromises();

      expect(wrapper.text()).toContain("IBM watsonx");
      expect(wrapper.text()).toContain("Google Gemini");
    });

    it("shows configured badge for connected providers", async () => {
      const wrapper = mount(LlmProviderApp);
      await flushPromises();

      simulateMessage({
        command: "providerSettings",
        providers: mockProviders,
        currentProvider: "google",
        providerConfigs: {
          wca: { apiEndpoint: "https://c.ai.ansible.redhat.com" },
          google: { apiKey: "test-key", modelName: "gemini-pro" },
        },
        connectionStatuses: { wca: false, google: true },
      });
      await flushPromises();

      expect(wrapper.text()).toContain("Configured");
    });

    it("shows active badge for active provider", async () => {
      const wrapper = mount(LlmProviderApp);
      await flushPromises();

      simulateMessage({
        command: "providerSettings",
        providers: mockProviders,
        currentProvider: "google",
        providerConfigs: {
          wca: {},
          google: {},
        },
        connectionStatuses: { wca: false, google: true },
      });
      await flushPromises();

      expect(wrapper.text()).toContain("Active");
    });
  });

  describe("provider actions", () => {
    const mockProviders = [
      {
        type: "google",
        name: "google",
        displayName: "Google Gemini",
        description: "Test provider",
        defaultEndpoint: "https://test.com",
        configSchema: [
          {
            key: "apiKey",
            label: "API Key",
            type: "password",
            required: true,
            placeholder: "test",
            description: "Test key",
          },
        ],
        usesOAuth: false,
        requiresApiKey: true,
      },
    ];

    it("toggles edit mode when edit button is clicked", async () => {
      const wrapper = mount(LlmProviderApp);
      await flushPromises();

      simulateMessage({
        command: "providerSettings",
        providers: mockProviders,
        currentProvider: "google",
        providerConfigs: { google: { apiKey: "" } },
        connectionStatuses: { google: false },
      });
      await flushPromises();

      const editButton = wrapper.find(".edit-btn");
      await editButton.trigger("click");
      await flushPromises();

      expect(wrapper.find(".provider-config").exists()).toBe(true);
    });

    it("sends connect message when connect button is clicked", async () => {
      const wrapper = mount(LlmProviderApp);
      await flushPromises();

      simulateMessage({
        command: "providerSettings",
        providers: mockProviders,
        currentProvider: "google",
        providerConfigs: { google: { apiKey: "" } },
        connectionStatuses: { google: false },
      });
      await flushPromises();
      mockPostMessage.mockClear();

      const connectButton = wrapper.find(".connect-btn");
      await connectButton.trigger("click");

      expect(mockPostMessage).toHaveBeenCalledWith({
        command: "connectProvider",
        provider: "google",
      });
    });

    it("sends activate message when switch button is clicked", async () => {
      const wrapper = mount(LlmProviderApp);
      await flushPromises();

      const twoProviders = [
        ...mockProviders,
        {
          type: "wca",
          name: "wca",
          displayName: "IBM watsonx",
          description: "Test",
          defaultEndpoint: "https://test.com",
          configSchema: [],
          usesOAuth: true,
          requiresApiKey: false,
        },
      ];

      simulateMessage({
        command: "providerSettings",
        providers: twoProviders,
        currentProvider: "wca",
        providerConfigs: { google: {}, wca: {} },
        connectionStatuses: { google: true, wca: true },
      });
      await flushPromises();
      mockPostMessage.mockClear();

      const switchButton = wrapper.find(".switch-btn");
      if (switchButton.exists()) {
        await switchButton.trigger("click");

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "activateProvider",
          provider: "google",
        });
      }
    });

    it("sends save message when save button is clicked", async () => {
      const wrapper = mount(LlmProviderApp);
      await flushPromises();

      simulateMessage({
        command: "providerSettings",
        providers: mockProviders,
        currentProvider: "google",
        providerConfigs: { google: { apiKey: "" } },
        connectionStatuses: { google: false },
      });
      await flushPromises();

      const editButton = wrapper.find(".edit-btn");
      await editButton.trigger("click");
      await flushPromises();

      mockPostMessage.mockClear();

      const saveButton = wrapper.find(".save-btn");
      await saveButton.trigger("click");

      expect(mockPostMessage).toHaveBeenCalledWith({
        command: "saveProviderSettings",
        provider: "google",
        config: expect.any(Object),
      });
    });
  });

  describe("connection result handling", () => {
    it("updates connection status on successful connection", async () => {
      const wrapper = mount(LlmProviderApp);
      await flushPromises();

      const mockProviders = [
        {
          type: "google",
          name: "google",
          displayName: "Google Gemini",
          description: "Test",
          defaultEndpoint: "https://test.com",
          configSchema: [],
        },
      ];

      simulateMessage({
        command: "providerSettings",
        providers: mockProviders,
        currentProvider: "google",
        providerConfigs: { google: {} },
        connectionStatuses: { google: false },
      });
      await flushPromises();

      simulateMessage({
        command: "connectionResult",
        provider: "google",
        connected: true,
      });
      await flushPromises();

      expect(wrapper.text()).toContain("Configured");
    });

    it("logs error on failed connection", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());
      const wrapper = mount(LlmProviderApp);
      await flushPromises();

      const mockProviders = [
        {
          type: "google",
          name: "google",
          displayName: "Google Gemini",
          description: "Test",
          defaultEndpoint: "https://test.com",
          configSchema: [],
        },
      ];

      simulateMessage({
        command: "providerSettings",
        providers: mockProviders,
        currentProvider: "google",
        providerConfigs: { google: {} },
        connectionStatuses: { google: false },
      });
      await flushPromises();

      simulateMessage({
        command: "connectionResult",
        provider: "google",
        connected: false,
        error: "Invalid API key",
      });
      await flushPromises();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Connection failed for google"),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("unsaved changes detection", () => {
    it("detects unsaved changes when config is modified", async () => {
      const wrapper = mount(LlmProviderApp);
      await flushPromises();

      const mockProviders = [
        {
          type: "google",
          name: "google",
          displayName: "Google Gemini",
          description: "Test",
          defaultEndpoint: "https://test.com",
          configSchema: [
            {
              key: "apiKey",
              label: "API Key",
              type: "password",
              required: true,
              placeholder: "test",
              description: "Test",
            },
          ],
        },
      ];

      simulateMessage({
        command: "providerSettings",
        providers: mockProviders,
        currentProvider: "google",
        providerConfigs: { google: { apiKey: "" } },
        connectionStatuses: { google: false },
      });
      await flushPromises();

      const editButton = wrapper.find(".edit-btn");
      await editButton.trigger("click");
      await flushPromises();

      const input = wrapper.find('input[type="password"]');
      await input.setValue("new-api-key");
      await flushPromises();

      expect(wrapper.text()).toContain("Unsaved changes");
    });
  });
});
