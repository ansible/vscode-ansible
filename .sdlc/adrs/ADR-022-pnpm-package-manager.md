# ADR-022: Migrate to pnpm for Supply-Chain Security

## Status

Implemented

## Date

2026-06-30

## Context

The JavaScript supply-chain threat landscape escalated sharply in
2025–2026. The Shai-Hulud worm (Sep 2025) automated package compromise <!-- cspell:disable-line -->
and redistribution. The Axios attack (Mar 2026) exploited a stolen
token to publish `axios@1.14.1` with no code review — affecting one of
npm's most-downloaded packages. Most directly relevant: the Miasma
attack (Jun 2026) compromised **32 packages under
`@redhat-cloud-services`** via a stolen Red Hat employee GitHub
account, bypassing code review entirely and affecting ~80K weekly
downloads.

These attacks share a pattern: malicious code executes via lifecycle
scripts (`postinstall`) during `npm install`, before any human reviews
the code. The npm CLI provides **no consumer-side defenses by
default** — no script blocking, no release cooldown, no trust policy.
Every protection requires manual opt-in, and most teams don't enable
them.

Meanwhile, this project has accumulated practical pain from npm's
architectural limitations:

- **Phantom dependencies**: npm's flat `node_modules` hoisting allows
  packages to import transitive dependencies they don't declare (e.g.,
  `yaml` in `src/features/fileDetection.ts` uses a copy hoisted from
  `packages/language-server`). This creates "works on my machine" bugs
  and fragile resolution.
- **Lockfile conflicts**: `package-lock.json` is a massive JSON file
  that causes constant merge conflicts and includes platform-specific
  resolution metadata.
- **Slow installs**: Cold installs take 14–45s depending on project
  size; pnpm achieves 4s for the same workload.
- **Weak workspace tooling**: No `workspace:*` protocol for local
  package references, no `--filter` graph traversal, no dependency
  isolation between workspace packages.
- **No script discoverability**: `npm run` lists script names without
  descriptions (mitigated by `scripts/help.mjs` per ADR-021).
- **No dependency update command**: Requires third-party
  `npm-check-updates` (mitigated by `npm run deps:check` per PR
  #2971).

The question is whether to switch from npm to a package manager that
provides security-by-default and addresses these UX gaps.

## Decision

**We will migrate from npm to pnpm as the project's package manager,
primarily for its supply-chain security defaults.**

pnpm provides three consumer-side defenses enabled by default that
directly address the 2025–2026 attack patterns:

1. **Lifecycle script blocking** (since v10): Dependency `postinstall`
   scripts do not execute unless explicitly allowed via
   `allowBuilds`. This blocks the primary malware execution
   vector.
2. **Release cooldown** (default 24h in v11): Packages published less
   than 24 hours ago are excluded from resolution. The Axios attack
   window was 4–5 hours — pnpm's default cooldown would have blocked
   it entirely.
3. **Trust policy** (`trustPolicy: no-downgrade`): Blocks installation
   when a package's publishing authentication weakens between versions
   (e.g., previously published via GitHub Actions OIDC, now published
   with a bare token). This is unique to pnpm — no other package
   manager offers it.

Additionally, pnpm's strict dependency isolation (symlinked
`node_modules`) eliminates phantom dependency bugs, and its
content-addressable store reduces disk usage by ~70%.

## Alternatives Considered

### Alternative 1: Stay with npm (status quo)

**Description**: Continue using npm with manual hardening (`--ignore-scripts`,
`.npmrc` settings, `npm audit signatures`).

**Pros**:

- Zero migration cost
- Bundled with Node.js — no additional install step
- Maximum ecosystem compatibility (100%)
- Contributors already familiar with it

**Cons**:

- No consumer-side security defaults — every protection is opt-in
- Flat `node_modules` permits phantom dependencies
- Slowest install times of any modern package manager
- `package-lock.json` merge conflicts
- Weak workspace tooling (no `workspace:*` protocol, no `--filter`)
- No built-in script descriptions or dependency update command
- The npm CLI is the only major JS package manager that has not shipped
  consumer-side defenses as of mid-2026

**Why not chosen**: The security gap is the deciding factor. For a Red
Hat project, in a year when Red Hat npm packages were compromised,
relying on manual opt-in security is an unacceptable posture. The UX
and performance gaps compound the case.

### Alternative 2: Bun

**Description**: Switch to Bun as both runtime and package manager.

**Pros**:

- 10–30x faster installs than npm, 4–5x faster than pnpm
- Blocks lifecycle scripts by default
- Native script descriptions in `bunfig.toml` (solves ADR-021's
  discoverability gap without `help.mjs`)
- All-in-one toolkit (runtime, bundler, test runner, package manager)
- Configurable `minimumReleaseAge` for release cooldown

**Cons**:

- ~95% Node.js compatibility — edge cases with VS Code extension
  tooling, vitest, wdio, and esbuild are a risk
- No `trustPolicy: no-downgrade` equivalent (cannot detect auth
  downgrade attacks)
- No `blockExoticSubdeps` (cannot block git/tarball URLs in transitive
  deps)
- Flat `node_modules` layout — phantom dependencies remain possible
- Monorepo/workspace support is functional but less battle-tested than
  pnpm (this project has 6+ workspace packages)
- Adoption as a standalone package manager is minimal (~500K weekly
  downloads vs pnpm's ~65M)
- Release cooldown is opt-in, not default

**Why not chosen**: Bun's speed advantage is compelling, but it lacks
pnpm's strongest security features (`trustPolicy`, `blockExoticSubdeps`,
`strictDepBuilds`) and its flat `node_modules` doesn't prevent phantom
dependencies. The ~95% Node.js compatibility introduces risk for a
project that depends heavily on VS Code APIs, vitest, and wdio. Bun is
the right choice for greenfield projects; for a mature monorepo with
established tooling, pnpm is the safer migration.

### Alternative 3: Yarn Berry (v4)

**Description**: Switch to Yarn Berry with Plug'n'Play (PnP) mode.

**Pros**:

- Blocks lifecycle scripts by default
- Release cooldown enabled by default
- PnP eliminates `node_modules` entirely — strictest possible
  dependency isolation
- Zero-install workflows (commit the PnP cache)
- `workspace:*` protocol support

**Cons**:

- ~90% ecosystem compatibility — PnP mode has persistent issues with
  tools that assume `node_modules` exists (VS Code extension host,
  esbuild, vitest)
- Steep learning curve for contributors
- Adoption has plateaued (~7M weekly downloads)
- No `trustPolicy: no-downgrade` equivalent
- Fallback to `nodeLinker: node-modules` negates PnP benefits

**Why not chosen**: PnP's compatibility issues are a significant risk
for a VS Code extension project. The extension host, esbuild bundler,
and test frameworks all assume `node_modules`. Using Yarn Berry with
`nodeLinker: node-modules` fallback provides no advantage over pnpm
while adding configuration complexity.

### Alternative 4: vlt

**Description**: Adopt vlt, the new package manager from npm's
original creator.

**Pros**:

- Server-side dependency resolution via VSR (Volt Serverless Registry)
- Visual dependency graph explorer
- CSS-like query syntax for dependency management
- Blocks lifecycle scripts by default (phased installation)

**Cons**:

- Still in release candidate (v1.0.0-rc.24 as of Apr 2026)
- 501 GitHub stars — negligible adoption
- No production track record
- Written in TypeScript, not a performance-first rewrite
- No release cooldown or trust policy features yet

**Why not chosen**: Too early. Interesting direction, especially VSR
for private registry hosting, but not production-ready for a project
that ships a VS Code Marketplace extension.

## Consequences

### Positive

- Supply-chain attacks via lifecycle scripts are blocked by default
- Newly published malicious packages are excluded for 24 hours
- Auth downgrade attacks are detectable via `trustPolicy: no-downgrade`
- Phantom dependency bugs are eliminated by strict isolation
- Install times improve ~3x (14s → 4s cold)
- Disk usage drops ~70% via content-addressable store
- `workspace:*` protocol makes inter-package dependencies explicit
- `--filter` enables targeted workspace operations
- `pnpm outdated` and `pnpm audit` are built-in (replaces
  `npm run deps:check` workaround)
- ADR-007 (`npm exec` over `npx`) maps directly to `pnpm exec`
- Supersedes ADR-021's `help.mjs` workaround — pnpm's UX gaps are
  smaller (though not fully solved; see Negative)

### Developer Experience (non-security bonus)

- **~3x faster installs**: Cold installs drop from ~14s to ~4s; warm
  installs are near-instant thanks to the content-addressable store
- **~70% less disk usage**: Packages are hard-linked from a global
  store — no more duplicate copies across projects
- **Explicit workspace references**: `workspace:*` protocol makes
  inter-package dependencies self-documenting and prevents accidental
  resolution from the registry
- **Targeted workspace operations**: `--filter` enables running
  commands on specific packages and their dependency graph (e.g.,
  `pnpm --filter @ansible/lightspeed run build:webviews`)
- **Built-in dependency management**: `pnpm outdated` and `pnpm audit`
  replace the custom `deps:check` workaround — no third-party tools
  needed
- **Cleaner lockfile diffs**: `pnpm-lock.yaml` is YAML-based and
  deterministic — merge conflicts are rarer and easier to resolve than
  `package-lock.json`
- **Strict isolation catches real bugs early**: Phantom dependency
  imports that "work on my machine" with npm fail immediately at
  install time, surfacing issues before they reach CI or production

### Negative

- Adds a non-bundled prerequisite (pnpm via Corepack or standalone
  install) — increases contributor onboarding friction
- CI workflows (especially WSL Fedora provisioning) need pnpm
  installation steps
- All documentation, ADRs, agent skills, and CI workflows referencing
  `npm` must be updated (estimated ~50 files)
- `allowBuilds` allowlist must be maintained for packages needing
  native binaries (esbuild, sharp, chromedriver, etc.)
- Existing phantom dependencies must be fixed before migration (at
  least `yaml` at root, `tsx` as devDep)
- `pnpm run` still does not support script descriptions — the
  discoverability gap from ADR-021 remains (though `help.mjs` or a
  prek hook can continue to serve this role)

### Neutral

- `pnpm import` can convert `package-lock.json` to `pnpm-lock.yaml`,
  easing the transition
- `@vscode/vsce package --no-dependencies` already sidesteps the
  classic vsce + pnpm symlink issue — no packaging changes needed
- The esbuild bundler (`scripts/build.mjs`) uses path aliases to
  workspace source, not `node_modules` — no bundling changes needed
- This decision supersedes ADR-007 (npm exec → pnpm exec) and
  ADR-021 (npm scripts UX) in scope, though both remain valid in
  principle

## Implementation Notes

### Migration order

1. **Fix phantom dependencies** before switching: add `yaml` to root
   `dependencies`, `tsx` to root `devDependencies`, audit
   `knip.json` `ignoreDependencies`
2. **Create pnpm configuration**:
   - `pnpm-workspace.yaml` with `packages`, `overrides`, and
     `allowBuilds` (pnpm 11 reads all settings from this file)
   - `packageManager` field in `package.json`
   - `.npmrc` reduced to auth/registry only (pnpm 11 requirement)
3. **Convert lockfile**: `pnpm import` from `package-lock.json`
4. **Update scripts**: `npm run` → `pnpm run`, `-w` → `--filter`,
   `npm exec` → `pnpm exec` across all `package.json` files
5. **Update CI**: add `pnpm/action-setup@v4`, update `cache: pnpm`,
   install pnpm in WSL provisioning, `npm ci` → `pnpm install
   --frozen-lockfile`
6. **Update prek hooks**: `npm exec` → `pnpm exec` in `prek.toml`
7. **Update documentation**: CLAUDE.md, AGENTS.md, README.md, all
   ADRs, agent skills, contributing guides
8. **Full validation**: `pnpm run ci` + WDIO + integration tests on
   all CI platforms (Linux, Windows, WSL)

### Key configuration

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'docs'
```

```yaml
# pnpm-workspace.yaml (continued)
overrides:
  "mocha>diff": "^8.0.3"
  "mocha>serialize-javascript": "^7.0.5"

allowBuilds:
  esbuild: true
  sharp: true
  edgedriver: true
  "@vscode/vsce-sign": true
  unrs-resolver: true
```

In pnpm 11, all settings live in `pnpm-workspace.yaml` — the `pnpm`
field in `package.json` and non-auth `.npmrc` settings are no longer
read. `autoInstallPeers` and `strictPeerDependencies: false` are
defaults in pnpm 11. Trust policy and release cooldown are also
enabled by default — no additional configuration needed.

## Related Decisions

- ADR-007: `npm exec` over `npx` — superseded in scope (becomes
  `pnpm exec` over `npx`)
- ADR-021: npm scripts over external task runners — partially
  superseded (pnpm is still "scripts in package.json", not an external
  task runner, but `pnpm outdated` replaces `deps:check`)
- ADR-006: esbuild bundler — unaffected (esbuild works identically
  with pnpm)
- ADR-011: Package architecture — unaffected in principle; workspace
  references change from `"*"` to `"workspace:*"`

## References

- [pnpm supply-chain security](https://pnpm.io/next/supply-chain-security)
- [npm supply-chain security in 2026 (Mondoo)](https://mondoo.com/blog/npm-supply-chain-security-package-manager-defenses-2026)
- [npm threat landscape (Palo Alto Unit 42)](https://origin-unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- [@redhat-cloud-services compromise (Jun 2026)](https://origin-unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- [pnpm vs npm vs Yarn vs Bun 2026 (DEV Community)](https://dev.to/pockit_tools/pnpm-vs-npm-vs-yarn-vs-bun-the-2026-package-manager-showdown-51dc)
- [pnpm vs Bun 2026 (PkgPulse)](https://www.pkgpulse.com/guides/pnpm-vs-bun-2026)

---

## Revision History

| Date       | Author           | Change           |
| ---------- | ---------------- | ---------------- |
| 2026-06-30 | Bradley Thornton | Initial proposal |
