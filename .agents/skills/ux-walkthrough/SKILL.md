---
name: ux-walkthrough
description: >
    Guide a team member through all Ansible extension
    functionality as an end user. Collect structured UX feedback and
    produce a Jira-ready report. Use when the user says "ux walkthrough",
    "dogfood the extension", "test the extension as a user", "ux review",
    or wants to evaluate release readiness.
argument-hint: '[--epic EPIC-KEY] [--resume] [--no-ai]'
user-invocable: true
metadata:
    author: ansible-environments team
    version: 1.0.0
---

# UX Walkthrough (Team Dogfooding)

Guide a team member through **every user-facing capability** of the Ansible
Environments VS Code extension. This is an **interactive** skill — one module
at a time, hands-on exercises, structured reflection, and a report for Jira.

**Not** the developer `onboard` skill. **Not** the MCP `get_extension_walkthrough`
tool (that demos MCP to end users). This skill is for **internal release
readiness** feedback.

## References

| File                                                                                                                     | Purpose                                             |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| [`walkthrough-modules.md`](walkthrough-modules.md)                                                                       | Module order, exercises, steps (human + JSON block) |
| [`walkthrough-modules.json`](walkthrough-modules.json)                                                                   | Same content — for Phase 2 extension panel          |
| [`catalog.md`](catalog.md)                                                                                               | Full feature inventory by module                    |
| [`report-template.md`](report-template.md)                                                                               | Report scaffold                                     |
| [`docs/.../feature-ansible-ide-experience.md`](../../../docs/src/content/docs/roadmap/feature-ansible-ide-experience.md) | PRD user stories & acceptance criteria              |

## Arguments

| Flag              | Behavior                                                    |
| ----------------- | ----------------------------------------------------------- |
| `--epic AAP-1234` | Stamp epic on report + Jira story proposals                 |
| `--resume`        | Continue from `last_module` in latest in-progress report    |
| `--no-ai`         | Skip `ai-authoring`, `mcp-skills`, and `lightspeed` modules |

## Session start

### 0. Workspace preparation (before build/F5)

**Ask first** — use `AskQuestion` or a direct prompt:

| Option                        | What happens                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Scaffold a sample project** | Agent creates a small playbook project (similar to `~/github/demo`) under `~/ansible-ux-walkthrough/` |
| **Use an existing project**   | User provides a path (e.g. `~/github/demo`) that already has playbooks/inventory                      |

Record the chosen path in the report frontmatter: `environment.workspace`.

**Sample project layout** (when scaffolding):

```text
~/ansible-ux-walkthrough/
  ansible.cfg
  inventory/hosts.yml
  playbooks/site.yml
  playbooks/webservers.yml
  playbooks/patch.yml
  roles/webserver/tasks/main.yml
  ...
```

Mirror the structure of a realistic demo — multiple playbooks, inventory, one
simple role. Do **not** commit this to the extension repo; it lives in the
reviewer's home directory.

**Virtual environment — use the sidebar:**

Venv creation and ansible-dev-tools installation now work from the sidebar
on all editors (VS Code, Cursor, OpenVSX) via the tiered capability model
(ADR-019). The reviewer should **not** create the venv manually in a
terminal — that's what Module 1 tests.

After F5 and opening the workspace, the reviewer will use the Environment
Managers sidebar to create a venv and install ansible-dev-tools. If the
`ms-python.vscode-python-envs` extension is installed, the native wizard
handles it; otherwise the extension falls back to terminal commands
automatically. Either path should feel seamless — note any friction as
UX feedback.

### 1. Launch the extension (repo window)

1. **Build the extension** (repo root):

    ```bash
    npm run compile && npm run build
    ```

2. **Press F5** — opens the **Extension Development Host** window.
3. **Open the workspace** — in the dev host: **File → Open Folder** →
   `<workspace-path>` (the scaffolded or existing Ansible project).
   Do not use the empty `examples/` folder unless it has content.
4. **Do all walkthrough steps in the dev host window** — Activity Bar,
   sidebar views, and output channel.

**Cursor (optional):** Canvas progress UI stays in the repo window while the
reviewer exercises the extension in the dev host.

Alternative for packaged testing (not the default): `npm run package:install`.

Ask for: reviewer name, epic key, workspace path, whether AI and Lightspeed
are enabled **in the Extension Development Host window**.

### 2. Initialize report

Create `.sdlc/ux-reports/YYYY-MM-DD-<reviewer>.md` from [`report-template.md`](report-template.md).
Create the directory first if it does not exist: `mkdir -p .sdlc/ux-reports`.

Fill frontmatter: `reviewer`, `date`, `epic`, `extension_version` (from `package.json`),
`environment` (OS, editor, AI/Lightspeed flags, workspace path).

On `--resume`, find the newest report with `session_status: in_progress` and read
`last_module` instead of creating a new file.

### 3. Open progress Canvas (Cursor only)

If the reviewer uses **Cursor**, create or update a Canvas at:

```text
~/.cursor/projects/<workspace>/canvases/ux-walkthrough-progress.canvas.tsx
```

Follow the [Canvas skill](~/.cursor/skills-cursor/canvas/SKILL.md): single file,
`cursor/canvas` imports only, inline data, no `fetch`.

**Canvas must show:**

- Vertical stepper for all 12 modules (`pending` | `current` | `complete` | `skipped`)
- Current module card: title, exercise, next step, US/AC mapping
- Session stats: modules done, issue counts by severity, average value score
- Epic key if provided

**Update the Canvas after each module** when you append to the report.

If not using Cursor, skip Canvas and track progress in the report frontmatter only.

## Module loop

Read module definitions from [`walkthrough-modules.md`](walkthrough-modules.md).
Process modules in `order` sequence. Skip modules where:

- `--no-ai` and `requiresAi: true` → mark `skipped` in report and Canvas
- Lightspeed disabled and `requiresLightspeed: true` → mark `skipped`

For each module, run this loop:

### A. Orient

Present from `catalog.md` and the module JSON entry:

- What capability area this covers (PRD US/AC)
- Where to find it in the UI (view ID, command palette names)
- What "done" looks like

### B. Try (hands-on)

Give the reviewer the `exercise` text and walk through `steps` one at a time.
Wait for them to complete each step before advancing. Do not rush.

Point to specific commands they can run from Command Palette if helpful.

### C. Reflect — five questions

Ask these **in order**. Wait for answers:

1. **Expectation** — What did you expect to happen?
2. **Outcome** — Did it work? (`yes` / `partial` / `no`)
3. **User mental model** — What would end users expect?
4. **Issues** — Bugs, confusion, missing affordances? (repro steps for bugs)
5. **Value** — Will users find this valuable? Score 1–5 and brief why.

### D. Record

Append to the report under **Module findings** using the template block.

For each issue, add a row to **Issues catalog** with:

- Auto-increment ID: `UX-001`, `UX-002`, …
- Severity: `blocker` | `major` | `minor` | `enhancement`
- Type: `bug` | `ux-gap` | `expectation-mismatch` | `missing-feature` | `polish`
- Module ID and US/AC mapping

Update report frontmatter:

- `last_module: <module-id>`
- `modules_completed: <count>`
- `issues_count` tallies
- `session_status: in_progress`

Update Canvas module states and stats.

**US-18 check:** For non-AI modules (1–7, 11), if core functionality requires AI,
log as `blocker` with type `ux-gap` — violates "works without AI".

Ask: "Ready for the next module, or pause here?" Respect pauses.

## Module sequence

| Order | ID                      | Title                               | Skip when           |
| ----: | ----------------------- | ----------------------------------- | ------------------- |
|     0 | `setup`                 | Setup & First Impressions           | never               |
|     1 | `environment`           | Environment & Tool Management       | never               |
|     2 | `editor-lsp`            | Editor & Language Server            | never               |
|     3 | `collections-installed` | Installed Collections & Plugin Docs | never               |
|     4 | `collections-remote`    | Collection Sources & Installation   | never               |
|     5 | `creator`               | Content Scaffolding                 | never               |
|     6 | `playbooks`             | Playbook Execution                  | never               |
|     7 | `execution-envs`        | Execution Environments              | never               |
|     8 | `ai-authoring`          | AI-Assisted Authoring               | `--no-ai`           |
|     9 | `mcp-skills`            | MCP Tools & AI Skills               | `--no-ai`           |
|    10 | `lightspeed`            | Ansible Lightspeed                  | Lightspeed disabled |
|    11 | `cross-cutting`         | Cross-Cutting UX                    | never               |

## Session wrap-up

When all applicable modules are done:

1. Write **Executive summary** (3–5 sentences on release readiness)
2. Complete **Value matrix** table
3. Generate **Proposed Jira stories** for every `blocker`, `major`, and `minor` issue
4. List **Open questions for PM** (branding, Lightspeed positioning, scope)
5. Note **Walkthrough content feedback** for `walkthrough-modules.md` improvements
6. Set `session_status: complete` in report frontmatter
7. Final Canvas update — all modules complete or skipped

Tell the reviewer:

> Your report is at `.sdlc/ux-reports/<file>.md`. Say "create Jira tickets
> from my UX report" when ready to file stories under the epic.

## Jira follow-up

Do **not** auto-create Jira issues. When asked, use the `jira-integration`
skill (user-level, at `~/.agents/skills/jira-integration/`). If that skill
is not installed, guide the reviewer through manual Jira filing using the
**Proposed Jira stories** section of the report:

1. Read **Proposed Jira stories** from the report
2. Show human-readable preview per story
3. Create Stories/Tasks linked to the epic after confirmation

## Agent rules

- **One module at a time** — never dump the full journey
- **Canvas always visible in Cursor** — create at start, update after each module
- **Record as you go** — do not batch findings to the end
- **Bugs need repro steps** — distinguish from ux-gap and expectation-mismatch
- **Cite PRD** — reference US-# and AC-# in findings
- **Feed Phase 2** — unclear step instructions go in Walkthrough content feedback
- **Be honest about gaps** — e.g. go-to-definition not yet implemented (see `.sdlc/todos/pending/add-goto-definition-provider.md`)

## Related skills

| Skill              | When                                                          |
| ------------------ | ------------------------------------------------------------- |
| `onboard`          | New developer learning the codebase                           |
| `manage-todos`     | Track extension work items in `.sdlc/todos/`                  |
| `jira-integration` | File stories from the report (user-level skill, `~/.agents/`) |
| `submit-pr`        | Ship fixes from walkthrough findings                          |
