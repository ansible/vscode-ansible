# Instructions for AI Agents

This document provides guidelines for AI agents working on this codebase.

## General Development Guidelines

### Code Validation

- **Always validate changes**: Run `task lint` and `task test` and resolve any reported build issues.
- **Avoid `__dirname`**: Do not use `__dirname` in new code. It doesn't work well with transpiled code as relative paths differ when files are transpiled vs. run directly with `ts-node`. Use `PROJECT_ROOT` from `test/setup.ts` instead.

## Pull Request Checklist

### Commit Messages

- [ ] **50/72 rule**: Commit title must be less than 50 characters; additional lines wrapped at 72 characters.
- [ ] **Conventional commits**: PR title and description (from first commit) must follow [conventional commits](https://www.conventionalcommits.org) standard.
- [ ] **Issue references**: Commit or PR body must include one plain text line referencing a GitHub issue and/or Jira issue using:

  ```text
  (fixes|closes|related): #<issue_number|AAP-number>
  ```

  Do not use URLs; just the issue key (it will be auto-linked when rendered).
- [ ] **Quality**: Commit messages should be **informative**, **brief**, and use **correct grammar**. Less is more—avoid boilerplate language. AI can help write better messages.

### Pull Request Structure

- [ ] **Single commit**: PR should contain a single commit. Squash changes and rebase before pushing new changes.
- [ ] **Atomic changes**: If changes can be split into smaller atomic PRs, do so.
- [ ] **Draft status**: Keep PR as *draft* until CI reports green on all jobs.

### Testing & Build

- [ ] **All tests passing**: All tests must pass. If a failure doesn't look related to your change, double-check. You may need a preparatory PR to fix the issue first.
- [ ] **Build artifacts**: Ensure build jobs produce at least 3 artifacts matching these patterns:
  - `logs*`
  - `@ansible-language-server*.tgz`
  - `ansible-extension-build-*.zip`

### Documentation

- [ ] **Heading titles**: Keep heading titles **short** so they render without wrapping in the sidebar.
- [ ] **Code blocks & diagrams**: Ensure code blocks and diagrams render correctly in both dark and light mode.
- [ ] **Media files**: Images and videos must:
  - Not be blurry
  - Be small in size
  - Use appropriate formats: `png`, `svg`, `webp`, `mp4` (avoid `gif`)
