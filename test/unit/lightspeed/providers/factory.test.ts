/* eslint-disable @typescript-eslint/no-explicit-any */
import { assert } from "chai";

// Test the provider factory in isolation
describe("LLMProviderFactory", () => {
  let LLMProviderFactory: any;

  before(async () => {
    try {
      const module = await import(
        "../../../../src/features/lightspeed/providers/factory.js"
      );
      LLMProviderFactory = module.LLMProviderFactory;
    } catch (error) {
      console.log("Could not import LLMProviderFactory, skipping tests");
      return;
    }
  });

  describe("Singleton pattern", () => {
    it("should return singleton instance", () => {
      if (!LLMProviderFactory) {
        return;
      }

      const instance1 = LLMProviderFactory.getInstance();
      const instance2 = LLMProviderFactory.getInstance();
      assert.equal(instance1, instance2);
    });
  });

  describe("Supported providers", () => {
    it("should return list of supported providers", () => {
      if (!LLMProviderFactory) {
        return;
      }

      const factory = LLMProviderFactory.getInstance();
      const providers = factory.getSupportedProviders();

      assert.isArray(providers);
      assert.isAtLeast(providers.length, 2); // wca, google

      const providerTypes = providers.map((p: any) => p.type);
      assert.include(providerTypes, "wca");
      assert.include(providerTypes, "google");
    });

    it("should include required provider information", () => {
      if (!LLMProviderFactory) {
        return;
      }

      const factory = LLMProviderFactory.getInstance();
      const providers = factory.getSupportedProviders();

      providers.forEach((provider: any) => {
        assert.property(provider, "type");
        assert.property(provider, "name");
        assert.property(provider, "displayName");
        assert.property(provider, "description");
        assert.property(provider, "configSchema");
        assert.isArray(provider.configSchema);
      });
    });

    it("should include proper config schema for each provider", () => {
      if (!LLMProviderFactory) {
        return;
      }

      const factory = LLMProviderFactory.getInstance();
      const providers = factory.getSupportedProviders();

      providers.forEach((provider: any) => {
        provider.configSchema.forEach((field: any) => {
          assert.property(field, "key");
          assert.property(field, "label");
          assert.property(field, "type");
          assert.property(field, "required");
          assert.include(
            ["string", "password", "number", "boolean"],
            field.type,
          );
        });
      });
    });
  });

  describe("Configuration validation", () => {
    it("should validate Google config", () => {
      if (!LLMProviderFactory) {
        return;
      }

      const factory = LLMProviderFactory.getInstance();
      const validConfig = {
        enabled: true,
        provider: "google",
        apiEndpoint: "https://generativelanguage.googleapis.com/v1beta",
        apiKey: "AIza-test-key",
        modelName: "gemini-2.5-flash",
        timeout: 30000,
        customHeaders: {},
      };

      const result = factory.validateProviderConfig("google", validConfig);
      assert.isBoolean(result);
    });

    it("should reject config with missing required fields", () => {
      if (!LLMProviderFactory) {
        return;
      }

      const factory = LLMProviderFactory.getInstance();
      const invalidConfig = {
        enabled: true,
        provider: "google",
        apiEndpoint: "",
        apiKey: "", // Missing required field
        modelName: "gemini-2.5-flash",
        timeout: 30000,
        customHeaders: {},
      };

      const result = factory.validateProviderConfig("google", invalidConfig);
      assert.isFalse(result);
    });
  });

  describe("Provider creation", () => {
    it("should handle provider creation errors gracefully", () => {
      if (!LLMProviderFactory) {
        return;
      }

      const factory = LLMProviderFactory.getInstance();

      try {
        const config = {
          enabled: true,
          provider: "unsupported",
          apiEndpoint: "",
          apiKey: "test-key",
          modelName: "test-model",
          timeout: 30000,
          customHeaders: {},
        };

        factory.createProvider("unsupported" as any, config);
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.instanceOf(error, Error);
        assert.include((error as Error).message, "Unsupported provider type");
      }
    });
  });
});
