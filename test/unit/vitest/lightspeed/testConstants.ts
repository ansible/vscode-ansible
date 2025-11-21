/**
 * Test constants and mock data for provider factory and base provider tests
 */

import type { LightSpeedServiceSettings } from "../../../../src/interfaces/extensionSettings.js";

// Model names
export const MODEL_NAMES = {
  GEMINI_PRO: "gemini-1.5-pro",
  GEMINI_FLASH: "gemini-1.5-flash",
  GEMINI_25_FLASH: "gemini-2.5-flash",
  TEST_MODEL: "test-model",
} as const;

// Provider types (only WCA and Google are supported in factory)
export const PROVIDER_TYPES = {
  GOOGLE: "google",
  WCA: "wca",
} as const;

// API endpoints
export const API_ENDPOINTS = {
  GOOGLE: "https://generativelanguage.googleapis.com/v1beta",
  WCA_DEFAULT: "https://c.ai.ansible.redhat.com",
} as const;

// Test API keys
export const TEST_API_KEYS = {
  GOOGLE: "AIzaSyTest-google-key-12345",
  TEST_KEY: "test-key",
} as const;

// Test provider information
export const TEST_PROVIDER_INFO = {
  NAME: "test-provider",
  DISPLAY_NAME: "Test Provider",
  PROVIDER_NAME: "TestProvider",
} as const;

// Test responses and IDs
export const TEST_RESPONSES = {
  COMPLETION: "test completion",
  MESSAGE: "test response",
  SUGGESTION_ID: "test-suggestion-id",
  CONVERSATION_ID_DEFAULT: "default-id",
} as const;

// Test prompts
export const TEST_PROMPTS = {
  INSTALL_NGINX: "Install nginx",
  CREATE_TASK: "Create a task",
  CREATE_ROLE: "Create a role",
  TEST_PROMPT: "test prompt",
  GENERIC: "Test prompt",
} as const;

// Test content
export const TEST_CONTENT = {
  PLAYBOOK: "---\n- name: test playbook",
  ROLE: "---\n- name: test role",
  OUTLINE_DEFAULT: "1. Test step",
} as const;

// Test operations
export const TEST_OPERATIONS = {
  GENERIC: "test-operation",
} as const;

// HTTP status codes for error testing
export const HTTP_STATUS_CODES = {
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  RATE_LIMIT: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  TEAPOT: 418, // For testing unknown status codes
} as const;

// Default timeouts
export const DEFAULT_TIMEOUTS = {
  DEFAULT: 30000,
  CUSTOM: 60000,
} as const;

// Partial test configuration objects (used by base provider tests)
export const TEST_CONFIGS = {
  GOOGLE_MINIMAL: {
    apiKey: TEST_API_KEYS.GOOGLE,
  },
  GOOGLE_FULL: {
    apiKey: TEST_API_KEYS.GOOGLE,
    modelName: MODEL_NAMES.GEMINI_PRO,
    timeout: 45000,
  },
  GOOGLE_WITH_MODEL: {
    apiKey: TEST_API_KEYS.GOOGLE,
    modelName: MODEL_NAMES.GEMINI_25_FLASH,
    timeout: DEFAULT_TIMEOUTS.DEFAULT,
  },
  WCA: {
    apiEndpoint: API_ENDPOINTS.WCA_DEFAULT,
  },
  BASE_TEST: {
    apiKey: TEST_API_KEYS.TEST_KEY,
  },
} as const;

// Base LightSpeedServiceSettings with all required common properties
export const BASE_LIGHTSPEED_SETTINGS: Omit<LightSpeedServiceSettings, "provider" | "apiKey" | "apiEndpoint"> = {
  enabled: true,
  URL: "",
  modelName: undefined,
  model: undefined,
  timeout: DEFAULT_TIMEOUTS.DEFAULT,
  customHeaders: {},
  suggestions: { enabled: true, waitWindow: 0 },
  playbookGenerationCustomPrompt: undefined,
  playbookExplanationCustomPrompt: undefined,
};

// Complete LightSpeedServiceSettings for common test scenarios
export const TEST_LIGHTSPEED_SETTINGS = {
  GOOGLE_MINIMAL: {
    ...BASE_LIGHTSPEED_SETTINGS,
    provider: PROVIDER_TYPES.GOOGLE,
    apiKey: TEST_API_KEYS.GOOGLE,
    apiEndpoint: "",
  } as LightSpeedServiceSettings,
  GOOGLE_FULL: {
    ...BASE_LIGHTSPEED_SETTINGS,
    provider: PROVIDER_TYPES.GOOGLE,
    apiKey: TEST_API_KEYS.GOOGLE,
    modelName: MODEL_NAMES.GEMINI_PRO,
    timeout: 45000,
    apiEndpoint: "",
  } as LightSpeedServiceSettings,
  GOOGLE_WITH_EMPTY_API_KEY: {
    ...BASE_LIGHTSPEED_SETTINGS,
    provider: PROVIDER_TYPES.GOOGLE,
    apiKey: "",
    apiEndpoint: "",
  } as LightSpeedServiceSettings,
  WCA: {
    ...BASE_LIGHTSPEED_SETTINGS,
    provider: PROVIDER_TYPES.WCA,
    apiKey: "",
    apiEndpoint: API_ENDPOINTS.WCA_DEFAULT,
  } as LightSpeedServiceSettings,
  UNSUPPORTED: {
    ...BASE_LIGHTSPEED_SETTINGS,
    provider: "unsupported" as string,
    apiKey: "",
    apiEndpoint: "",
  } as LightSpeedServiceSettings,
};

// Google provider specific constants
export const GOOGLE_PROVIDER = {
  NAME: "google",
  DISPLAY_NAME: "Google Gemini",
  PROVIDER_NAME: "Google Gemini",
} as const;

// Ansible test content
export const ANSIBLE_CONTENT = {
  SINGLE_TASK: "- name: Install nginx\n  ansible.builtin.package:\n    name: nginx\n    state: present",
  MULTI_TASK: "- name: Task one\n  ansible.builtin.debug:\n    msg: 'First task'\n- name: Task two\n  ansible.builtin.debug:\n    msg: 'Second task'",
  PLAYBOOK: "---\n- hosts: all\n  tasks:\n    - name: Install nginx\n      ansible.builtin.package:\n        name: nginx",
  INVALID_YAML: "- name: Task\n  invalid: [unclosed",
  YAML_WITH_CODE_BLOCK: "```yaml\n- name: Test task\n  ansible.builtin.debug:\n    msg: 'test'\n```",
  YAML_WITH_EXPLANATION: "Here's the playbook:\n- name: Test task\n  ansible.builtin.debug:\n    msg: 'test'",
  EMPTY: "",
  NULL_YAML: "null",
} as const;

