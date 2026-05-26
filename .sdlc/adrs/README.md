# Architecture Decision Records

This directory contains the Architecture Decision Records (ADRs) for
vscode-ansible.

## Implemented

Decisions that are fully reflected in the codebase.

| ADR | Title | Date |
|-----|-------|------|
| [ADR-001](ADR-001-service-based-architecture.md) | Service-Based Architecture with VS Code-Independent Core | 2026-05-26 |
| [ADR-002](ADR-002-centralized-plugin-doc-cache.md) | Centralized Plugin Documentation Cache | 2026-05-26 |

## Accepted

Decisions that have been accepted but are not yet fully implemented.

| ADR | Title | Date |
|-----|-------|------|
| [ADR-004](ADR-004-intentional-exclusions-from-main.md) | Intentional Feature Exclusions from main | 2026-05-26 |
| [ADR-005](ADR-005-architectural-invariants.md) | Architectural Invariants | 2026-05-26 |

## Proposed

Decisions under consideration — not yet accepted or implemented.

| ADR | Title | Date |
|-----|-------|------|
| [ADR-003](ADR-003-ee-via-devcontainers.md) | Execution Environment Support via Dev Containers | 2026-05-26 |

## Creating New ADRs

1. Copy the template from `../templates/adr.md`
2. Use the next available number (currently ADR-006)
3. Include:
   - Status (Proposed → Accepted → Implemented)
   - Date
   - Context
   - Alternatives Considered
   - Decision
   - Rationale
   - Consequences (positive/negative)
   - Implementation Notes
   - Related Decisions
