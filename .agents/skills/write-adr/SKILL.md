---
name: write-adr
description: >
  Write an Architecture Decision Record (ADR) for long-lasting architectural
  decisions. Use when introducing a new service, changing the package
  structure, adopting a new protocol or data model, altering caching
  strategy, or making any structural choice that future contributors must
  understand. Do NOT use for bug fixes, config changes, or tactical
  refactors that don't change the system's shape.
user-invocable: true
---

# Write an ADR

## When to write an ADR

Write an ADR when a change meets **any** of these criteria:

- Introduces or removes a package, service, or major component.
- Changes how packages depend on each other.
- Adopts a new protocol, data format, or external tool.
- Alters the caching, persistence, or data-flow strategy.
- Moves a capability boundary (e.g., what runs inside VS Code vs
  standalone).
- Makes a trade-off that will be non-obvious in six months.

**Do NOT** write an ADR for:

- Bug fixes, test additions, or lint cleanups.
- Configuration or CI changes.
- Routine dependency bumps.
- Tactical refactors that don't change externally visible architecture.

## Workflow

### 1. Determine the next ADR number

Check `.sdlc/adrs/README.md` for the next available number.

### 2. Write the ADR

Create `.sdlc/adrs/ADR-NNN-<slug>.md` using the template at
`.sdlc/templates/adr.md`. Every section is required:

| Section | Guidance |
|---------|----------|
| **Status** | `Proposed` if not yet implemented; `Implemented` if the code ships in the same PR. |
| **Date** | Today's date (YYYY-MM-DD). |
| **Context** | What problem exists, what forces are in tension. Be specific — name the files, services, or flows involved. |
| **Decision** | One bold sentence: **We will …**. Then describe the concrete changes. |
| **Alternatives Considered** | At least two alternatives, each with Pros, Cons, and Why not chosen. |
| **Consequences** | Split into Positive, Negative, Neutral. Be honest about trade-offs. |
| **Implementation Notes** | Practical guidance: key files, migration steps, patterns to follow. |
| **Related Decisions** | Link to any ADRs this builds on or supersedes. |
| **Revision History** | Table with Date, Author, Change columns. |

### 3. Update the index

Add the new ADR to `.sdlc/adrs/README.md` under the correct status
heading (Proposed, Accepted, or Implemented). Increment the "next
available number" note in the Creating New ADRs section.

### 4. Include the ADR in the PR

The ADR ships in the same PR as the code change it documents. It is
not a follow-up task.

## Style guidelines

- **Context**: Write enough that someone unfamiliar with the codebase
  understands the problem. Include code snippets or interface shapes
  when they clarify the issue.
- **Alternatives**: Show genuine alternatives, not strawmen. If an
  alternative was seriously considered, say so.
- **Consequences — Negative**: Always list at least one negative
  consequence. Every decision has trade-offs; claiming otherwise
  undermines credibility.
- **Length**: Aim for 100–300 lines. ADR-001 (foundational) may be
  longer; most should not be.

## ADR lifecycle

| Status | Meaning |
|--------|---------|
| Proposed | Under discussion, not yet accepted. |
| Accepted | Approved but not yet fully implemented. |
| Implemented | Code reflects this decision. |
| Deprecated | No longer relevant. |
| Superseded by ADR-NNN | Replaced by a newer decision. |

A single PR can move status from Proposed → Implemented if the code
ships together.
