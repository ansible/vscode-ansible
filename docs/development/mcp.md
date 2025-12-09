# Ansible MCP Server - Developer Guide

This guide covers MCP-specific development tasks: adding new tools, writing MCP tests, and adding resources.

For general contributing guidelines (setup, workflow, code style), see the [main contributing docs](contributing.md).

---

## Table of Contents

1. [Adding New Tools](#adding-new-tools)
2. [Adding Resources](#adding-resources)
3. [Testing](#testing)
4. [Resources and References](#resources-and-references)

---

## Adding New Tools

This section explains how to add a new tool to the MCP server.

---

### Step 1: Create Tool Implementation

Create a new file under `packages/ansible-mcp-server/src/tools/` with the tool logic.

**Example: `src/tools/myNewTool.ts`**

```typescript
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

### Step 2: Create Handler Function

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

### Step 3: Register Tool in the Server

Update `src/server.ts`:

#### Import handler

```typescript
import { createMyNewToolHandler } from "./handlers.js";
```

#### Register using `registerToolWithDeps`

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

#### Important: Tool Metadata for AI Inference

The `description`, `keywords`, and `useCases` fields are critical for AI assistants to infer which tool to use when a user's prompt doesn't explicitly name the tool. AI assistants analyze these fields to match user intent with the appropriate tool.

- **`description`**: Provide a clear, detailed description of what the tool does and when it should be used. Include common scenarios and expected outcomes.

- **`keywords`**: List relevant terms, synonyms, and related concepts that users might mention when they need this tool. Think about how users would describe the task in natural language.

- **`useCases`**: Describe specific scenarios where this tool is applicable. Be detailed and include variations of how users might express the need for this functionality.

**Example of good metadata:**

```typescript
{
  title: "Ansible Lint",
  description: "Validates Ansible playbooks, roles, and collections for best practices, style, and potential errors. Checks YAML syntax, module usage, naming conventions, and security issues. Can automatically fix some issues when requested.",
  annotations: {
    keywords: [
      "lint", "validate", "check", "quality", "best practices",
      "style", "errors", "warnings", "yaml", "syntax",
      "fix", "auto-fix", "code quality", "playbook validation"
    ],
    useCases: [
      "Check a playbook for errors before committing",
      "Validate YAML syntax in Ansible files",
      "Find and fix common style issues automatically",
      "Review code quality and best practices",
      "Get linting results for a specific file"
    ],
  },
}
```

This detailed metadata helps AI assistants understand that when a user says "check my playbook for issues" or "validate this YAML file", they likely want the `ansible_lint` tool, even if they don't mention "lint" explicitly.

---

### Step 4: Update Tool Count

Update the constant in `src/constants.ts`:

```typescript
export const TOOL_COUNT = 12; // increment accordingly
```

---

### Step 5: Add Dependency Management (Optional)

If your tool uses external binaries (ansible-lint, navigator, etc.):

#### Update `dependencyChecker.ts`

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

#### Pass dependencies during registration

```typescript
registerToolWithDeps(
  "my_new_tool",
  { /* config */ },
  createMyNewToolHandler(),
  MY_TOOL_DEPENDENCIES,
);
```

---

### Best Practices for Tool Development

- **Error Handling:** Always use try/catch and return `isError: true`.
- **Path Resolution:** Use `resolve()` and check existence.
- **Input Validation:** Use Zod schemas.
- **Output Formatting:** Keep responses human-readable.

---

## Adding Resources

Resources are read-only data exposed by the MCP server.

---

### Step 1: Add Resource Data File

Place your resource data file in `src/resources/data/`:

**Example: `src/resources/data/myResource.md`**

```markdown
# My Resource

This is the content of my resource.
```

---

### Step 2: Create Resource Accessor

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

### Step 3: Register Resource in Server

Update `src/server.ts`:

```typescript
import { getMyResource } from "./resources/myResource.js";

server.setRequestHandler(ListResourcesRequestSchema, async () => {
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

### Step 4: Update Build Script (if needed)

If your resource needs to be copied during build, the existing `copy-resources` script in `package.json` handles this:

```json
{
  "scripts": {
    "copy-resources": "mkdir -p out/server/src/resources/data && cp -r src/resources/data/* out/server/src/resources/data/"
  }
}
```

---

### Best Practices for Resources

- Keep resource files in `src/resources/data/`.
- Use descriptive URIs following the `ansible://` scheme.
- Provide clear descriptions and appropriate MIME types.
- Ensure resources are read-only and don't change at runtime.

---

## Testing

For general testing information (running tests, test structure, coverage), see the [Testing documentation](test_code.md).

This section covers MCP-specific testing patterns and practices.

---

### Running MCP Tests

Run MCP tests using:

```bash
task mcp:test
```

---

### Writing MCP Tests

#### Typical test file structure

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

#### Testing Handler Directly

```typescript
const handler = createMyNewToolHandler();
const result = await handler({ param1: "test" });
expect(result.content[0].type).toBe("text");
```

---

#### Testing Implementation Functions

```typescript
const output = await runMyNewTool("a", "b");
expect(output.result).toBeDefined();
```

---

#### Server Registration Test

```typescript
const server = createTestServer("/tmp");
expect(server.listTools().map(t => t.name)).toContain("my_new_tool");
```

---

### MCP-Specific Test Best Practices

- Always validate MCP response shape (verify `content` array, `type: "text"`, and `text` property).
- Test tool registration in the server.
- Test integration through the server's tool calling mechanism.
- Use `createTestServer` from `test/testWrapper.ts` for consistent test setup.
- Follow existing tool tests for reference (e.g., `test/tools/ansibleLint.test.ts`).

---

### Manual Testing

Manual testing is useful for validating behavior in real MCP clients.

#### Running Server in STDIO Mode

```bash
cd packages/ansible-mcp-server
npm run dev:stdio
```

Or after building:

```bash
node out/server/src/cli.js --stdio
```

#### Send Manual JSON-RPC Requests

**Call `zen_of_ansible`:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "zen_of_ansible", "arguments": {} }
}
```

**Call `ansible_lint`:**

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

#### Testing with Cursor / Claude Desktop

- Add MCP server config
- Restart client
- Trigger tools via chat
- Validate formatting, errors, and output correctness

#### Manual Testing Checklist

- [ ] Tool appears in `list_available_tools`
- [ ] Executes correctly with valid input
- [ ] Returns `isError` for invalid input
- [ ] Correct JSON-RPC response
- [ ] Clean, readable output
- [ ] Handles edge cases

---

## Resources and References

### Internal Documentation

- [API Reference](../mcp/api.md) - Complete MCP server API documentation
- [MCP Server Overview](../mcp/README.md) - Getting started guide

### External Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [Vitest Documentation](https://vitest.dev/)
- [Zod Documentation](https://zod.dev/)

### Related Tools

- [ansible-lint](https://ansible-lint.readthedocs.io/)
- [ansible-navigator](https://ansible-navigator.readthedocs.io/)
- [ansible-builder](https://ansible-builder.readthedocs.io/)
- [ansible-creator](https://ansible-creator.readthedocs.io/)
