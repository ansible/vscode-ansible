# Architecture Decision Records

This directory contains the Architecture Decision Records (ADRs) for
vscode-ansible.

## Implemented

Decisions that are fully reflected in the codebase.

| ADR | Title | Date |
|-----|-------|------|
| [ADR-001](ADR-001-service-based-architecture.md) | Service-Based Architecture with VS Code-Independent Core | 2026-05-26 |
| [ADR-002](ADR-002-centralized-plugin-doc-cache.md) | Centralized Plugin Documentation Cache | 2026-05-26 |

## Creating New ADRs

1. Copy the template from `../templates/adr.md`
2. Use the next available number (currently ADR-003)
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
