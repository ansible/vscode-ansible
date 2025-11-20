/**
 * Test constants and mock data for provider factory and base provider tests
 */

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

// Test configuration objects
export const TEST_CONFIGS = {
  GOOGLE_MINIMAL: {
    apiKey: TEST_API_KEYS.GOOGLE,
    suggestions: { enabled: true, waitWindow: 0 },
  },
  GOOGLE_FULL: {
    apiKey: TEST_API_KEYS.GOOGLE,
    modelName: MODEL_NAMES.GEMINI_PRO,
    timeout: 45000,
    suggestions: { enabled: true, waitWindow: 0 },
  },
  GOOGLE_WITH_MODEL: {
    apiKey: TEST_API_KEYS.GOOGLE,
    modelName: MODEL_NAMES.GEMINI_25_FLASH,
    timeout: DEFAULT_TIMEOUTS.DEFAULT,
  },
  WCA: {
    apiEndpoint: API_ENDPOINTS.WCA_DEFAULT,
    suggestions: { enabled: true, waitWindow: 0 },
  },
  BASE_TEST: {
    apiKey: TEST_API_KEYS.TEST_KEY,
  },
} as const;

// Google provider specific constants
export const GOOGLE_PROVIDER = {
  NAME: "google",
  DISPLAY_NAME: "Google Gemini",
  PROVIDER_NAME: "Google Gemini",
} as const;

// Ansible file types
export const ANSIBLE_FILE_TYPES = {
  PLAYBOOK: "playbook",
  TASKS: "tasks",
  HANDLERS: "handlers",
  VARS: "vars",
  ROLE: "role",
  INVENTORY: "inventory",
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

