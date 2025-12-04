# Instructions for agents

- Validate code changes by running `task lint` and `task test` and resolving
  any reported build issues issues.
- Ensure that new code is not added that uses `__dirname` because this does
  not work well with transpiled code as relative paths would very different
  if the file was transpiled or run directly with ts-node or similar. Make use
  of `PROJECT_ROOT` from `test/setup.ts` if needed.

## Code reviews

- Ensure that build jobs produced at least 3 artifacts matching these grep
  patterns `logs*`, `@ansible-language-server*.tgz`,
  `ansible-extension-build-*.zip`.
