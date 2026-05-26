---
title: Analyze Creator form validation opportunities
created: 2026-05-26
status: pending
priority: medium
scope: panels
---

# Analyze Creator form validation opportunities

## Context

`next`'s `CreatorFormPanel` dynamically generates forms from the
ansible-creator CLI schema. `main` had 7 hardcoded Vue panels with
custom per-field validation (e.g., FQCN format checks, path existence,
version format).

The dynamic approach is architecturally superior but may miss
field-level validation that the hardcoded panels provided.

## Acceptance criteria

- [ ] Deep-dive comparison of `main`'s per-panel validation logic
      against `next`'s dynamic form capabilities
- [ ] Identify validation rules from `main` that are missing in `next`
- [ ] Propose how to add field-level validation to the schema-driven
      form (e.g., regex patterns, custom validators, schema annotations)
- [ ] Implement identified validation gaps

## Notes

Check `main`'s Creator panels for: FQCN namespace.name format
validation, path existence/writability checks, version semver
validation, required field enforcement, and any prerequisite checks
(e.g., ansible-creator minimum version).
