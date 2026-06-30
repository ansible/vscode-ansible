# Architecture Decision Records

This directory contains the Architecture Decision Records (ADRs) for
vscode-ansible.

## Implemented

Decisions that are fully reflected in the codebase.

| ADR                                                  | Title                                                    | Date       |
| ---------------------------------------------------- | -------------------------------------------------------- | ---------- |
| [ADR-001](ADR-001-service-based-architecture.md)     | Service-Based Architecture with VS Code-Independent Core | 2026-05-26 |
| [ADR-002](ADR-002-centralized-plugin-doc-cache.md)   | Centralized Plugin Documentation Cache                   | 2026-05-26 |
| [ADR-007](ADR-007-npm-exec-over-npx.md)              | Use `npm exec` Instead of `npx`                          | 2026-06-10 |
| [ADR-008](ADR-008-strict-eslint-configuration.md)    | Strict ESLint Configuration with Type-Checked Presets    | 2026-06-10 |
| [ADR-009](ADR-009-jsdoc-enforcement.md)              | Mandatory JSDoc on All Functions and Methods             | 2026-06-10 |
| [ADR-015](ADR-015-lightspeed-standalone-package.md)  | Lightspeed as a Standalone Opt-In Package                | 2026-06-18 |
| [ADR-016](ADR-016-docs-as-ecosystem-hub.md)          | Documentation Site as Ecosystem Hub                      | 2026-06-22 |
| [ADR-017](ADR-017-status-bar-click-to-quickpick.md)  | Status Bar Click-to-QuickPick Interaction                | 2026-06-22 |
| [ADR-020](ADR-020-single-repo-multi-distribution.md) | Single Repository, Multiple Distribution Formats         | 2026-06-26 |
| [ADR-022](ADR-022-pnpm-package-manager.md)           | Migrate to pnpm for Supply-Chain Security                | 2026-06-30 |

## Accepted

Decisions that have been accepted but are not yet fully implemented.

| ADR                                                     | Title                                                        | Date       |
| ------------------------------------------------------- | ------------------------------------------------------------ | ---------- |
| [ADR-004](ADR-004-intentional-exclusions-from-main.md)  | Intentional Feature Exclusions from main                     | 2026-05-26 |
| [ADR-005](ADR-005-architectural-invariants.md)          | Architectural Invariants                                     | 2026-05-26 |
| [ADR-006](ADR-006-esbuild-bundler.md)                   | esbuild Bundler for Extension and Packages                   | 2026-06-10 |
| [ADR-011](ADR-011-package-architecture.md)              | Package Architecture — @ansible/common and @ansible/services | 2026-06-16 |
| [ADR-012](ADR-012-mcp-tool-parity.md)                   | MCP Tool Parity for Extension Capabilities                   | 2026-06-17 |
| [ADR-013](ADR-013-scm-plugin-docs-via-shallow-clone.md) | SCM Collection Plugin Documentation via Shallow Clone        | 2026-06-17 |
| [ADR-014](ADR-014-internal-skills-as-prompt-source.md)  | Internal Skills as AI Prompt Source of Truth                 | 2026-06-18 |
| [ADR-018](ADR-018-mcp-skills-compliance.md)             | MCP and Skills Compliance Policy                             | 2026-06-23 |

## Proposed

Decisions under consideration — not yet accepted or implemented.

| ADR                                                    | Title                                            | Date       |
| ------------------------------------------------------ | ------------------------------------------------ | ---------- |
| [ADR-003](ADR-003-ee-via-devcontainers.md)             | Execution Environment Support via Dev Containers | 2026-05-26 |

## Creating New ADRs

1. Copy the template from `../templates/adr.md`
2. Use the next available number (currently ADR-023)
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
