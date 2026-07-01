---
name: define-user-story
description: >
    Define a user story for new user-facing functionality and optionally
    scaffold a WDIO test skeleton. Use when the submit-pr self-review
    detects new user-facing capabilities, or when the user says
    "define story", "add user story", or "new user story".
argument-hint: "[description of the new functionality]"
user-invocable: true
metadata:
    author: ansible-environments team
    version: 1.0.0
---

# Define User Story

Guide a developer through defining a user story for new or existing
user-facing functionality, then add it to the canonical story catalog
and optionally scaffold a WDIO test.

## When to use

- The `submit-pr` self-review (question 10) detected new user-facing
  functionality without a matching story
- A developer wants to document what a feature does from the user's
  perspective
- Coverage gaps need to be closed — `scripts/story-coverage.mjs`
  reports uncovered areas

## Workflow

### Step 1: Context gathering

Ask the developer:

> **What can the user do now that they couldn't before?**
>
> Describe it from the user's perspective — not "I added a command
> `ansibleFoo.bar`", but "the user can now see a visual diff of
> their playbook changes before running".

If the developer provides a command or implementation description,
reframe it as a user outcome.

### Step 2: Story drafting

Generate the story in "As a... I want... so that..." format:

```text
As an Ansible developer, I want to [outcome]
so that [benefit — why this matters to the user].
```

Rules:

- The subject is always "an Ansible developer" (or "an automation
  architect" for Content Designer features)
- The "I want" describes a **user-visible outcome**, not an
  implementation detail
- The "so that" explains the **value** — why does this matter?
- Do NOT mention commands, views, panels, or API calls in the story

### Step 3: Acceptance criteria

Generate 2–4 acceptance criteria from the developer's description.
Each criterion should be independently verifiable in a WDIO test:

```yaml
criteria:
  - The sidebar shows available playbook diffs
  - Clicking a diff opens a side-by-side comparison
  - Changes are highlighted with add/remove colors
```

Rules:

- Each criterion maps to one `it()` block in a WDIO spec
- Criteria describe **observable behavior**, not internal state
- Avoid "should" — use declarative present tense

### Step 4: Story ID and PRD mapping

Assign an ID using the area prefix + next available number:

| Area | Prefix | Covers |
|------|--------|--------|
| Environment management | `ENV-` | Python envs, tools, status bar |
| Editor & Language Server | `LSP-` | Completion, hover, diagnostics, vault, schemas |
| Collections | `COL-` | Installed + remote, docs, search, install |
| Content scaffolding | `SCF-` | Creator forms, CLI preview |
| Playbook execution | `PLB-` | Discovery, config, run, progress, AI analysis |
| Execution environments | `EE-` | Discovery, inspection, AI summary |
| AI authoring & MCP | `AI-` | Summaries, generation, discovery, LLM, MCP, skills |
| Lightspeed | `LS-` | Auth, generation, explanation, inline suggest |
| Cross-cutting | `XC-` | Activation, degradation, empty states |

Read `.sdlc/user-stories.yaml` to find the highest existing number
for the chosen prefix and increment it.

Map to PRD references:

- Check `docs/src/content/docs/roadmap/feature-ansible-ide-experience.md`
  for the closest US- and AC- identifiers
- If no PRD reference fits, use `[]` — the story stands on its own

### Step 5: Add to catalog

Append the new story to `.sdlc/user-stories.yaml`:

```yaml
  - id: PLB-007
    title: Visual playbook diff before execution
    story: >
      As an Ansible developer, I want to see a visual diff of my
      playbook changes before running, so that I can verify what
      changed since the last successful run.
    prd_refs: [US-6, AC-4]
    requires_ai: false
    criteria:
      - The sidebar shows available playbook diffs
      - Clicking a diff opens a side-by-side comparison
      - Changes are highlighted with add/remove colors
```

Set `requires_ai: true` if the feature needs an AI provider.

### Step 6: Optional WDIO test skeleton

Ask the developer:

> **Would you like me to scaffold a WDIO test for this story?**

If yes, create a test file (or add to an existing one) with:

```typescript
/**
 * @covers PLB-007
 */
describe('Playbook diff before execution', () => {
    it.skip('should show available playbook diffs in the sidebar', async () => {
        // TODO: implement — remove .skip when ready
    });

    it.skip('should open a side-by-side diff comparison', async () => {
        // TODO: implement — remove .skip when ready
    });

    it.skip('should highlight changes with add/remove colors', async () => {
        // TODO: implement — remove .skip when ready
    });
});
```

Place the file in `test/ui/` for core extension features or
`packages/<pkg>/test/wdio/` for package-specific features.

### Step 7: Verify coverage

Run the coverage script to confirm the story is tracked:

```bash
node scripts/story-coverage.mjs --threshold 0
```

The new story should appear in the covered or uncovered list
depending on whether the WDIO test has real assertions.

## Integration with submit-pr

This skill is invoked by `submit-pr` (question 10 in the
self-review) when new user-facing functionality is detected.
The typical flow:

1. Developer runs `/submit-pr`
2. Self-review detects a new `contributes.commands` entry or
   new Panel/Provider class
3. Agent prompts: "This PR adds user-facing functionality.
   Would you like me to help define a user story?"
4. If yes, this skill runs
5. Story is added to the catalog and optionally a test skeleton
   is created
6. Developer continues with the PR submission

The developer can decline — the CI catalog-completeness check
will flag the gap, but it's not a hard gate.
