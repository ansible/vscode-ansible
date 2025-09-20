# Ansible MCP Server Tests

This directory contains comprehensive tests for the Ansible MCP Server.

## Test Structure

```
test/
├── handlers.ts        # Direct handler unit tests
├── server.ts          # Server integration tests
├── integration.ts     # End-to-end integration tests
├── performance.ts     # Benchmark and performance tests
├── testWrapper.ts     # Test utilities and mocks
└── README.md          # This file
```

## Test Categories

### 1. **handlers.ts** - Unit Tests

- Tests individual handler functions in isolation
- Validates handler return formats and content
- Tests error handling and edge cases
- Fast execution, no external dependencies

### 2. **server.ts** - Server Integration Tests

- Tests the complete MCP server configuration
- Validates tool registration and metadata
- Tests server lifecycle and configuration
- Ensures proper integration between components

### 3. **integration.ts** - End-to-End Tests

- Tests complete request/response cycles
- Validates real-world usage scenarios
- Tests concurrent operations and consistency
- Ensures proper content formatting and validation

### 4. **performance.ts** - Performance & Benchmark Tests

- Measures response times and throughput
- Tests memory usage and leak detection
- Validates performance under load
- Ensures consistent performance characteristics

### 5. **testWrapper.ts** - Test Utilities

- Mock implementations for testing
- Test data generators and utilities
- Performance measurement helpers
- Common assertion functions

## Running Tests

### Prerequisites

```bash
cd packages/ansible-mcp-server
npm install
```

### Run All Tests

```bash
npm test
```

### Run Specific Test Categories

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Performance tests only
npm run test:performance

# Watch mode for development
npm run test:watch
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Run Tests in CI Mode

```bash
npm run test:ci
```

## Test Configuration

Tests are configured using Vitest with the following features:

- TypeScript support
- ES modules
- Code coverage reporting
- Performance benchmarking
- Concurrent test execution
- Watch mode for development

## Writing New Tests

### Test File Naming

- Use descriptive names: `feature.test.ts`
- Group related tests in `describe` blocks
- Use clear test descriptions with `it`

### Test Structure

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestServer } from "./testWrapper.js";

describe("Feature Name", () => {
  let server: ReturnType<typeof createTestServer>;

  beforeEach(() => {
    server = createTestServer("/test/workspace");
  });

  it("should do something specific", async () => {
    const result = await server.callTool("zen_of_ansible", {});
    expect(result).toBeDefined();
  });
});
```

### Best Practices

1. **Isolation**: Each test should be independent
2. **Clarity**: Use descriptive test names and assertions
3. **Coverage**: Test both success and error cases
4. **Performance**: Include performance assertions for critical paths
5. **Mocking**: Use test wrapper for consistent mocking

## Test Data

### Zen of Ansible Content

Tests validate that the `zen_of_ansible` tool returns:

- 20 numbered aphorisms
- Proper text formatting
- Consistent content across calls
- Key Ansible principles (idempotence, YAML, etc.)

### Performance Expectations

- Tool calls: < 100ms
- Server initialization: < 50ms
- Concurrent operations: < 500ms for 10 calls
- Memory usage: No significant leaks

## Debugging Tests

### Verbose Output

```bash
npm test -- --reporter=verbose
```

### Debug Specific Test

```bash
npm test -- --grep "zen_of_ansible"
```

### Performance Profiling

```bash
npm run test:performance -- --reporter=verbose
```

## Continuous Integration

Tests are designed to run in CI environments with:

- Deterministic results
- No external dependencies
- Reasonable timeouts
- Clear failure messages
- Coverage reporting

## Troubleshooting

### Common Issues

1. **Import errors**: Ensure `.js` extensions in imports
2. **Timeout errors**: Check performance test thresholds
3. **Coverage issues**: Verify all code paths are tested
4. **Flaky tests**: Use proper async/await patterns

### Getting Help

- Check test output for specific error messages
- Review test configuration in `vitest.config.ts`
- Ensure all dependencies are installed
- Verify Node.js version compatibility
