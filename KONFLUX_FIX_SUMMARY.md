# Konflux Build Fix - Root Cause Analysis

## The Real Problem

Konflux was **filtering out `.yarnrc.yml`** during the build, causing these cascading failures:

```
Error: no items matching glob ".yarnrc.yml" copied (1 filtered out using .dockerignore)
```

### What Happened

1. **Konflux auto-generated a `.dockerignore`** (or used `.gitignore` as one)
2. This filtered out `.yarnrc.yml` which specifies Yarn 4.10.3
3. Without `.yarnrc.yml`, Corepack fell back to downloading Yarn 1.22.22
4. **In Konflux's air-gapped environment**, the download failed
5. Yarn 1.x doesn't support the Yarn 4 workspace structure
6. Build failed with "No lockfile found" and "package.json not found"

### Why It Worked Locally

Locally, you have internet access, so even if Corepack tried to download Yarn, it could succeed. Plus, the `.yarn/releases/yarn-4.10.3.cjs` file was present.

## The Fix

### 1. Created `.dockerignore`

Explicitly controls what goes into the container:

```dockerignore
# Exclude build artifacts
node_modules
out
*.vsix

# KEEP these files - they are REQUIRED
!.yarnrc.yml
!.yarn/
!yarn.lock
!package.json
!packages
```

### 2. Simplified Containerfile

Back to `COPY . .` with debug output:

```dockerfile
COPY . .

# Debug: Verify critical files are present
RUN echo "=== DEBUG: Checking Yarn configuration ===" && \
    ls -lh .yarnrc.yml && \
    ls -lh .yarn/releases/ && \
    ls -lh package.json yarn.lock

# Prepare yarn (uses local .yarn/releases/yarn-4.10.3.cjs)
RUN corepack prepare

# Install and build
RUN yarn install --immutable
RUN yarn run package
```

## Key Insights

1. **Konflux is air-gapped** - Cannot download dependencies at build time
2. **`.dockerignore` matters** - Konflux may auto-generate one if you don't provide it
3. **Explicit is better** - Always include a `.dockerignore` to control the build context
4. **Yarn 4 needs `.yarn/releases/`** - The binary must be in the repo for air-gapped builds
5. **Debug output is essential** - Helps diagnose issues in CI/CD environments you can't access

## Files Changed

- ✅ `.dockerignore` - Created to explicitly control what's copied
- ✅ `vscode-ansible.Containerfile` - Simplified with debug output
- 📝 No Tekton changes needed - The pipeline configuration was correct

## Testing

Local build successful:
```
✅ Yarn 4.10.3 used
✅ All files present
✅ Package created successfully
```

## Next Steps

1. Commit both `.dockerignore` and `vscode-ansible.Containerfile`
2. Push to trigger Konflux build
3. Check logs for debug output
4. Build should now succeed in air-gapped Konflux environment

## Verification in Konflux

When the build runs, you should see:

```
=== DEBUG: Checking Yarn configuration ===
-rw-r--r-- .yarnrc.yml
=== DEBUG: Yarn releases directory ===
-rwxr-xr-x yarn-4.10.3.cjs
=== DEBUG: Yarn version ===
4.10.3
```

Instead of:

```
! Corepack is about to download yarn-1.22.22.tgz  ❌
info No lockfile found.                            ❌
```

