# ADR-009: Mandatory JSDoc on All Functions and Methods

## Status

Implemented

## Date

2026-06-10

## Context

The `next` branch had roughly 26% JSDoc coverage — ~164 of ~634
functions and methods had documentation. Coverage was unevenly
distributed: `@ansible/core` services were ~58% documented while the
language server and MCP server packages were under 5%.

### Why docstrings matter in an AI-assisted workflow

TypeScript's type system conveys the *shape* of data (parameter types,
return types, generics) but not the *intent*: why a function exists,
what side effects it has, what invariants it maintains, or what callers
should expect. This intent gap affects:

- **AI agents**: Language models operating on the codebase (Copilot,
  Cursor, MCP-connected agents) use docstrings as primary context for
  understanding function behavior. Without them, agents must infer
  intent from implementation details, which is slower and error-prone.
- **Human contributors**: New contributors and reviewers rely on
  function-level documentation to understand the API surface without
  reading every implementation.
- **API consumers**: The `@ansible/core` package is consumed by the
  extension, language server, and MCP server. Undocumented public APIs
  force consumers to read source code.

### Why 100% coverage (not just exported)

Internal/private functions are equally important for AI agents and
future maintainers. A private helper's docstring explains *why* it was
extracted, what edge cases it handles, and how it fits into the calling
function's logic. Partial coverage creates inconsistent context —
agents cannot predict which functions will have documentation.

## Decision

Enforce JSDoc on **every** function declaration, method definition, and
class declaration using `eslint-plugin-jsdoc` with the following rules
set to `error`:

| Rule | Purpose |
|------|---------|
| `jsdoc/require-jsdoc` | Require a JSDoc block on all functions, methods, classes, constructors, getters, and setters. |
| `jsdoc/require-param` | Require `@param` for every function parameter. |
| `jsdoc/require-param-description` | Require a description on each `@param` tag. |
| `jsdoc/require-returns` | Require `@returns` on functions with non-void return types. |
| `jsdoc/require-returns-description` | Require a description on the `@returns` tag. |
| `jsdoc/check-param-names` | Validate that `@param` names match the actual signature. |
| `jsdoc/check-tag-names` | Only allow standard JSDoc tags. |
| `jsdoc/no-types` | Disallow type annotations in JSDoc (TypeScript provides the types). |

### No test file exemptions

Test files follow the same rules. Test helper functions benefit from
documentation just as production code does — especially for AI agents
that need to understand test fixtures and setup patterns.

### No type annotations in JSDoc

The `jsdoc/no-types` rule prevents `@param {string} name` syntax.
TypeScript already provides type information; duplicating it in JSDoc
creates a maintenance burden where types go stale. JSDoc should describe
*intent and constraints*, not types:

```typescript
// Good — describes intent, TypeScript provides the type
/** @param name - Display name shown in the environment picker */

// Bad — duplicates TypeScript's type information
/** @param {string} name - Display name shown in the environment picker */
```

## Alternatives Considered

### eslint-plugin-tsdoc (TSDoc standard)

TSDoc is a stricter specification used by the TypeScript compiler and
VS Code APIs. However, `eslint-plugin-tsdoc` only validates syntax of
*existing* comments — it does not enforce *presence*. We need both
presence enforcement and syntax validation, which `eslint-plugin-jsdoc`
provides.

### Exported-only enforcement

Only requiring JSDoc on exported/public symbols would reduce the initial
effort but create a two-tier system where internal code remains
undocumented. AI agents do not distinguish between exported and internal
functions when building context.

### Documentation generation tool (TypeDoc) without lint enforcement

TypeDoc generates API docs from existing JSDoc but does not enforce
coverage. Without a lint rule, coverage would degrade over time as new
functions are added without documentation.

## Consequences

### Positive

- **Consistent AI context**: Every function in the codebase provides
  intent documentation that language models can consume.
- **Enforced at CI**: Missing or malformed JSDoc fails the lint check,
  preventing undocumented code from being merged.
- **Self-documenting codebase**: Contributors can understand any
  function's purpose from its JSDoc without reading the implementation.
- **Accurate parameter docs**: `check-param-names` catches stale
  `@param` tags when signatures change.

### Negative

- **Initial effort**: ~490 functions needed JSDoc added in the initial
  enforcement PR.
- **Ongoing cost**: Every new function requires a JSDoc block. This adds
  ~10-30 seconds per function during development.
- **Potential for low-quality docstrings**: Enforcement guarantees
  *presence* but not *quality*. Code review must still check that
  descriptions are meaningful, not just boilerplate to satisfy the linter.

### Neutral

- Lint run time is unaffected — `eslint-plugin-jsdoc` does not require
  type information (unlike `@typescript-eslint` type-checked rules).
- Existing accurate JSDoc is preserved; only missing or incomplete
  blocks are added.

## Implementation Notes

- Plugin: `eslint-plugin-jsdoc` added as a devDependency.
- Configuration: Rules added to the main config block in
  `eslint.config.mjs` (applies to all `.ts`/`.js` files).
- `ArrowFunctionExpression` and `FunctionExpression` are not required
  to have standalone JSDoc when used as inline callbacks — only named
  function declarations, method definitions, and class declarations
  are enforced.

## Related Decisions

- [ADR-008](ADR-008-strict-eslint-configuration.md) — Strict ESLint
  configuration (the JSDoc rules build on this foundation)
- [ADR-001](ADR-001-service-based-architecture.md) — Service-based
  architecture (the `@ansible/core` package API surface benefits most
  from documentation)
