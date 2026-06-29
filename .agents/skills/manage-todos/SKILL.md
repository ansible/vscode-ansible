---
name: manage-todos
description: >
    Create, list, and complete project todos tracked as files in
    .sdlc/todos/. Use when the user says "add a todo", "create a task",
    "what's pending", "mark X done", "list todos", or discusses work
    items for the next branch. Do NOT use for in-conversation ephemeral
    todos — this is for persistent project-level tracking.
user-invocable: true
---

# Manage Project Todos

## Structure

```text
.sdlc/todos/
  pending/      → work not yet started or in progress
  complete/     → finished work
```

One markdown file per todo. The directory determines status.

## Creating a todo

1. Pick a kebab-case filename from the title (e.g.,
   `add-definition-provider.md`).
2. Copy `.sdlc/templates/todo.md` and fill in:
    - `title` — concise description
    - `created` — today's date
    - `status` — `pending`
    - `priority` — `low`, `medium`, or `high`
    - `scope` — one of: `core`, `ls`, `mcp`, `extension`, `panels`,
      `views`, `ci`, `docs`
3. Write a brief Context section explaining why this is needed.
4. List concrete Acceptance criteria as checkboxes.
5. Save to `.sdlc/todos/pending/<slug>.md`.

Keep the file short — aim for under 40 lines.

## Listing todos

Read the `pending/` directory. Show a table:

```text
| File | Title | Priority | Scope |
```

Parse the YAML frontmatter for each file.

## Completing a todo

1. Move the file from `pending/` to `complete/`.
2. Update frontmatter: set `status: done`, add `completed: YYYY-MM-DD`.
3. Check off acceptance criteria that were met.

## Rules

- One todo per file. Don't combine unrelated work.
- Don't delete completed todos — move them to `complete/` for history.
- If a todo becomes irrelevant, set `status: cancelled` in frontmatter
  and move to `complete/`.
- Todos are checked into git and travel with the branch. They are not
  GitHub issues.
