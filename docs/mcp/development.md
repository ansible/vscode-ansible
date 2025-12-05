# Ansible MCP Server - Developer Guide

This guide provides detailed instructions for developers contributing to the Ansible MCP Server. It covers adding new tools, writing tests, managing dependencies, and contributing documentation.

---

## Table of Contents

1. [Adding New Tools](#adding-new-tools)
2. [Testing](#testing)
3. [Adding Resources](#adding-resources)
4. [Contributing Documentation](#contributing-documentation)
5. [Development Workflow](#development-workflow)
6. [Resources and References](#resources-and-references)

---

## Adding New Tools

This section explains how to add a new tool to the MCP server.

---

## Step 1: Create Tool Implementation

Create a new file under `src/tools/` with the tool logic.

**Example: `src/tools/myNewTool.ts`**

```typescript
import { spawn } from "node:child_process";
import { resolve } from "node:path";

/**
 * Executes the core functionality of your tool.
 */
export async function runMyNewTool(
  param1: string,
  param2?: string,
): Promise<{ result: unknown; output?: string }> {
  if (!param1) {
    throw new Error("param1 is required");
  }

  const absolutePath = resolve(param1);

  // TODO: implement tool logic

  return {
    result: {},
    output: "Tool execution completed successfully",
  };
}

/**
 * Formats the tool result for MCP response.
 */
export function formatMyNewToolResult(result: unknown): string {
  return `Tool execution completed: ${JSON.stringify(result, null, 2)}`;
}
```

---

## Step 2: Create Handler Function

Add a handler in `src/handlers.ts`:

```typescript
import { runMyNewTool, formatMyNewToolResult } from "./tools/myNewTool.js";

export function createMyNewToolHandler() {
  return async (args: { param1: string; param2?: string }) => {
    try {
      const { result } = await runMyNewTool(args.param1, args.param2);
      return {
        content: [{ type: "text", text: formatMyNewToolResult(result) }],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
        isError: true,
      };
    }
  };
}
```

---

## Step 3: Register Tool in the Server

Update `src/server.ts`:

### Import handler

```typescript
import { createMyNewToolHandler } from "./handlers.js";
```

### Register using `registerToolWithDeps`

```typescript
registerToolWithDeps(
  "my_new_tool",
  {
    title: "My New Tool",
    description: "Describe your tool usage here.",
    inputSchema: {
      param1: z.string().describe("Description of required param1"),
      param2: z.string().optional().describe("Description of optional param2"),
    },
    annotations: {
      keywords: ["keyword1", "keyword2"],
      useCases: ["Use case 1", "Use case 2"],
    },
  },
  createMyNewToolHandler(),
  [], // dependencies (optional)
);
```

---

## Step 4: Update Tool Count

Update the constant in `src/constants.ts`:

```typescript
export const TOOL_COUNT = 12; // increment accordingly
```

---

## Step 5: Add Dependency Management (Optional)

If your tool uses external binaries (ansible-lint, navigator, etc.):

### Update `dependencyChecker.ts`

```typescript
export const MY_TOOL_DEPENDENCIES: Dependency[] = [
  {
    name: "my-tool",
    command: "my-tool --version",
    minVersion: "1.0.0",
    installInstructions: "Install via: pip install my-tool",
  },
];
```

### Pass dependencies during registration

```typescript
registerToolWithDeps(
  "my_new_tool",
  { /* config */ },
  createMyNewToolHandler(),
  MY_TOOL_DEPENDENCIES,
);
```

---

## Best Practices for Tool Development

- **Error Handling:** Always use try/catch and return `isError: true`.
- **Path Resolution:** Use `resolve()` and check existence.
- **Input Validation:** Use Zod schemas.
- **Output Formatting:** Keep responses human-readable.
- **Documentation:** Add JSDoc comments and examples.

---

## Testing

The MCP server uses **Vitest** for testing. This section covers structure, commands, and examples.

---

## Directory Structure

```text
test/
  server.test.ts
  handlers.test.ts
  integration.test.ts
  tools/
  testWrapper.ts
```

---

## Running Tests

Navigate to the MCP server folder:

```bash
cd packages/ansible-mcp-server
```

### Run all tests

```bash
npm test
```

### Watch mode

```bash
npm run test:watch
```

### Specific test file

```bash
npm test test/tools/ansibleLint.test.ts
```

### Category-specific

```bash
npm run test:unit
npm run test:integration
npm run test:ade
npm run test:performance
```

### Coverage

```bash
npm run test:coverage
```

### Vitest UI

```bash
npm run test:ui
```

---

## Writing MCP Tests

### Typical test file structure

```typescript
describe("My New Tool", () => {
  let server = createTestServer("/workspace");

  it("executes successfully", async () => {
    const result = await server.callTool("my_new_tool", { param1: "v" });
    expect(result.content[0].text).toContain("completed");
  });

  it("handles errors", async () => {
    const result = await server.callTool("my_new_tool", { param1: "" });
    expect(result.isError).toBe(true);
  });
});
```

---

## Testing Handler Directly

```typescript
const handler = createMyNewToolHandler();
const result = await handler({ param1: "test" });
expect(result.content[0].type).toBe("text");
```

---

## Testing Implementation Functions

```typescript
const output = await runMyNewTool("a", "b");
expect(output.result).toBeDefined();
```

---

## Server Registration Test

```typescript
const server = createTestServer("/tmp");
expect(server.listTools().map(t => t.name)).toContain("my_new_tool");
```

---

## Integration Test Example

```typescript
const result = await server.callTool("my_new_tool", {
  param1: "value1",
});
expect(result.content).toBeDefined();
```

---

## Test Best Practices

- Test valid, invalid, and edge cases.
- Always validate MCP response shape.
- Use disposable temp directories.
- Follow existing tool tests for reference.

---

## Manual Testing

Manual testing is useful for validating behavior in real MCP clients.

---

## Running Server in STDIO Mode

Build:

```bash
npm run compile
```

Run:

```bash
node out/server/src/cli.js --stdio
```

Or dev mode:

```bash
npm run dev:stdio
```

---

## Send Manual JSON-RPC Requests

### Call `zen_of_ansible`

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "zen_of_ansible", "arguments": {} }
}
```

### Call `ansible_lint`

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "ansible_lint",
    "arguments": { "filePath": "/path/to.yml", "fix": false }
  }
}
```

---

## Testing with Cursor / Claude Desktop

- Add MCP server config
- Restart client
- Trigger tools via chat
- Validate formatting, errors, and output correctness

---

## Manual Testing Checklist

- [ ] Tool appears in `list_available_tools`
- [ ] Executes correctly with valid input
- [ ] Returns `isError` for invalid input
- [ ] Correct JSON-RPC response
- [ ] Clean, readable output
- [ ] Handles edge cases

---

## Adding Resources

Resources are read-only data exposed by the MCP server. This section explains how to add new resources.

---

## Step 1: Add Resource Data File

Place your resource data file in `src/resources/data/`:

**Example: `src/resources/data/myResource.md`**

```markdown
# My Resource

This is the content of my resource.
```

---

## Step 2: Create Resource Accessor

Create a function in `src/resources/` to access the resource:

**Example: `src/resources/myResource.ts`**

```typescript
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export async function getMyResource(): Promise<string> {
  const filePath = join(__dirname, "data", "myResource.md");
  return await readFile(filePath, "utf-8");
}
```

---

## Step 3: Register Resource in Server

Update `src/server.ts`:

```typescript
import { getMyResource } from "./resources/myResource.js";

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  // ... existing resources ...
  return {
    resources: [
      // ... existing resources ...
      {
        uri: "ansible://my-resource",
        name: "My Resource",
        description: "Description of my resource",
        mimeType: "text/markdown",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  // ... existing resource handlers ...
  if (request.params.uri === "ansible://my-resource") {
    const content = await getMyResource();
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "text/markdown",
          text: content,
        },
      ],
    };
  }
  // ... other resource handlers ...
});
```

---

## Step 4: Update Build Script (if needed)

If your resource needs to be copied during build, update `package.json`:

```json
{
  "scripts": {
    "copy-resources": "mkdir -p out/server/src/resources/data && cp -r src/resources/data/* out/server/src/resources/data/"
  }
}
```

---

## Best Practices for Resources

- Keep resource files in `src/resources/data/`.
- Use descriptive URIs following the `ansible://` scheme.
- Provide clear descriptions and appropriate MIME types.
- Ensure resources are read-only and don't change at runtime.

---

## Contributing Documentation

This section covers how to contribute to the MCP server documentation.

---

## Documentation Locations

- **API Reference**: `docs/mcp/api.md` - Complete API endpoint documentation
- **Overview**: `docs/mcp/README.md` - MCP server overview and getting started
- **Developer Guide**: `docs/mcp/development.md` - This document

---

## Documentation Format

- Use Markdown format (`.md` files)
- Follow existing documentation style
- Include code examples where relevant
- Keep documentation up-to-date with code changes

---

## Review Process

1. Create or update documentation files
2. Run linting: `npm run lint` (if applicable)
3. Submit PR with documentation changes
4. Documentation will be reviewed along with code changes

---

## Development Workflow

This section covers the standard development workflow for the MCP server.

---

## Setup

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the project:

   ```bash
   cd packages/ansible-mcp-server
   npm run compile
   ```

---

## Making Changes

1. Create a feature branch
2. Make your changes
3. Write tests for new functionality
4. Run tests:

   ```bash
   npm test
   ```

5. Build and verify:

   ```bash
   npm run compile
   ```

---

## Code Style

- Follow existing code style
- Use TypeScript strict mode
- Add JSDoc comments for public functions
- Keep functions focused and modular

---

## Resources and References

## Internal Documentation

- [API Reference](api.md) - Complete MCP server API documentation
- [MCP Server Overview](README.md) - Getting started guide

## External Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [Vitest Documentation](https://vitest.dev/)
- [Zod Documentation](https://zod.dev/)

## Related Tools

- [ansible-lint](https://ansible-lint.readthedocs.io/)
- [ansible-navigator](https://ansible-navigator.readthedocs.io/)
- [ansible-builder](https://ansible-builder.readthedocs.io/)
- [ansible-creator](https://ansible-creator.readthedocs.io/)

---
