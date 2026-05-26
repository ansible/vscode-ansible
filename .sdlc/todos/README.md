# Project Todos

Lightweight task tracking for the `next` branch. One file per todo,
managed by moving files between directories.

```
.sdlc/todos/
  pending/    → work not yet started or in progress
  complete/   → finished work (kept for reference)
```

## File naming

Use a short kebab-case slug: `add-definition-provider.md`,
`port-content-creator-webviews.md`.

## Creating a new todo

Copy the template from `../templates/todo.md` or use the `manage-todos`
agent skill.

## Completing a todo

Move the file from `pending/` to `complete/` and update the frontmatter
`status` to `done` and set `completed` to today's date.
