# Ansible MCP Server Tests

This directory contains comprehensive tests for the Ansible MCP Server
implementation following the ansible-language-server test structure conventions.

## Test Structure

### Contract Tests (`server.ts`)

- **API Contract**: Tests using testWrapper for consistent API behavior
- **Input Validation**: Parameter validation and edge cases
- **Return Format**: Ensures proper response structure
- **Server Configuration**: Tests for server metadata and registration

### Real Handler Tests (`handlers.ts`)

- **Actual Implementation**: Tests the real MCP server handler functions
  directly
- **External Dependencies**: Mocked `spawn`, `fs` for controlled testing
- **Error Scenarios**: Command not found, file errors, process failures
- **Process Lifecycle**: Tests real ansible-lint spawning and output capture

### Integration Tests (`integration.ts`)

- **Real Environment**: Testing without mocks in actual environment
- **File System**: Actual file operations against test fixtures
- **End-to-End**: Complete tool functionality validation
- **Input Validation**: Schema validation and error handling

### Performance Tests (`performance.ts`)

- **Concurrent Execution**: Multiple simultaneous operations
- **Memory Usage**: Resource consumption validation
- **Server Initialization**: Startup performance benchmarks
- **Error Handling Efficiency**: Error path performance

## Test Fixtures

### `fixtures/playbook.yml`

A simple, valid Ansible playbook for testing successful scenarios.

### `fixtures/playbook-with-issues.yml`

An Ansible playbook with intentional lint issues for testing error scenarios.

## Running Tests

```bash
# Run all tests once
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Test Coverage

The tests cover:

✅ **Tools**

- `debug_env` - Environment information retrieval
- `zen_of_ansible` - Static content delivery
- `ansible_lint` - External command execution with various scenarios

✅ **Resources**

- `workspace-file` - File reading with different path formats
- Error handling for missing files
- URI handling and response formatting

✅ **Prompts**

- `ansible_fix_prompt` - Template generation with parameters
- Input validation and error scenarios

✅ **Error Scenarios**

- Tool execution errors
- File system errors
- Input validation failures
- Process spawning failures

✅ **Performance**

- Concurrent operations
- Memory usage
- Initialization speed
- Error handling efficiency

## Mocking Strategy

### Unit Tests

- **File System**: Mocked with `vi.mock('node:fs/promises')`
- **Child Process**: Mocked with `vi.mock('node:child_process')`
- **Environment**: Controlled test environment variables

### Integration Tests

- Real file system operations against test fixtures
- Actual environment variables
- No external command execution (ansible-lint not required)

## Test Utilities

### `testWrapper.ts`

- Test wrapper for MCP server providing `callTool`, `callResource`, `callPrompt`
  methods
- Server metadata helpers for testing
- Clean separation of test code from production code

## Environment Variables

- `DEBUG_TESTS=1` - Enable console output during tests (if needed for debugging)

## Coverage Goals

- **Statements**: > 95%
- **Branches**: > 90%
- **Functions**: > 95%
- **Lines**: > 95%

Coverage reports are generated in `coverage/` directory.
