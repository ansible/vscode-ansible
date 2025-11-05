# Konflux Pipeline Build Issue - Analysis and Solutions

## Problem Summary

The Konflux pipeline build is failing with the following error:

```
npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '/usr/src/app/package.json'
```

## Root Cause Analysis

### Primary Issue: Incorrect Yarn Version

The build log shows:
```
yarn install v1.22.22
info No lockfile found.
```

However, your `package.json` specifies:
```json
"packageManager": "yarn@4.10.3+sha512..."
```

**The container is using Yarn 1.22.22 instead of Yarn 4.10.3!**

### Why This Causes the Error

1. Yarn 1.x has different behavior than Yarn 4.x (Berry)
2. Yarn 4 requires `.yarnrc.yml` and `.yarn/` directory to function properly
3. The workspace configuration in your monorepo is not compatible with Yarn 1.x
4. When Yarn 1.x runs `yarn install --immutable`, it doesn't properly handle the workspace structure
5. This causes the `node_modules` and dependencies to not be installed correctly
6. When `npm run package` tries to execute, the project structure is broken

### Secondary Issues

1. **Missing `.yarn` directory in COPY**: The `.yarn` directory contains Yarn 4 plugins and releases
2. **Missing `.yarnrc.yml` in COPY**: This file configures Yarn 4 behavior
3. **Order of COPY operations**: Copying everything with `COPY . .` doesn't leverage Docker layer caching effectively

## Solutions

### Option 1: Use the Fixed Containerfile (Recommended)

I've created `vscode-ansible.Containerfile.fixed` with the following improvements:

```dockerfile
FROM node:lts-slim

WORKDIR /usr/src/app

# Enable corepack to use the correct yarn version from package.json
RUN corepack enable

RUN apt-get update && \
    apt-get install -y python3 python3-pip unzip git git-lfs && \
    rm -rf /var/lib/apt/lists/*

# Copy yarn configuration files first
COPY .yarnrc.yml ./
COPY .yarn ./.yarn

# Copy package.json and yarn.lock for dependency installation
COPY package.json yarn.lock ./

# Prepare yarn - this will use the version specified in packageManager field
RUN corepack prepare

# Copy workspace package.json files (for monorepo)
COPY packages ./packages

# Install dependencies using the correct yarn version
RUN yarn install --immutable

# Copy the rest of the application
COPY . .

# Run the package script
RUN yarn run package
```

**Key changes:**
1. ✅ Copy `.yarnrc.yml` and `.yarn/` directory first
2. ✅ Run `corepack prepare` to activate the correct Yarn version from package.json
3. ✅ Copy workspace packages before installing dependencies
4. ✅ Use `yarn run package` instead of `npm run package` for consistency
5. ✅ Better layer caching by copying dependencies first

### Option 2: Update Original Containerfile with Minimal Changes

If you prefer to modify the original file:

```dockerfile
FROM node:lts-slim

WORKDIR /usr/src/app

RUN corepack enable

RUN apt-get update && \
    apt-get install -y python3 python3-pip unzip git git-lfs && \
    rm -rf /var/lib/apt/lists/*

COPY . .

# Add this line to ensure correct yarn version
RUN corepack prepare

RUN yarn install --immutable

# Change npm to yarn for consistency
RUN yarn run package
```

### Option 3: Use Debug Containerfile (for diagnostics)

I've also updated your original Containerfile with debug output. This will help you see exactly what's happening during the build.

## Steps to Fix

### 1. Update the Containerfile

Replace the content of `vscode-ansible.Containerfile` with the content from `vscode-ansible.Containerfile.fixed`:

```bash
mv vscode-ansible.Containerfile vscode-ansible.Containerfile.backup
mv vscode-ansible.Containerfile.fixed vscode-ansible.Containerfile
```

### 2. Update Tekton Pipeline Files (if needed)

The `.tekton/vscode-ansible-pull-request.yaml` and `.tekton/vscode-ansible-push.yaml` files already correctly reference:

```yaml
- name: dockerfile
  value: ./vscode-ansible.Containerfile
```

So no changes are needed to the Tekton files if you update the Containerfile.

### 3. Commit and Push

```bash
git add vscode-ansible.Containerfile
git commit -m "Fix: Use correct Yarn version in Containerfile

- Add .yarnrc.yml and .yarn/ directory to container
- Run corepack prepare to activate Yarn 4.10.3
- Copy workspace packages before yarn install
- Use yarn instead of npm for package script

Fixes Konflux build failure where Yarn 1.x was being used instead of Yarn 4.x"
git push
```

### 4. Test the Build

The next pull request or push to `main` should trigger the Konflux pipeline with the fixed Containerfile.

## Verification

After the fix, you should see in the build logs:

```
! Corepack is about to download https://registry.yarnpkg.com/yarn/-/yarn-4.10.3.tgz
```

Instead of:

```
! Corepack is about to download https://registry.yarnpkg.com/yarn/-/yarn-1.22.22.tgz
```

And `yarn install` should complete successfully without the "No lockfile found" message.

## Additional Notes

### Why `corepack prepare` Works

Corepack reads the `packageManager` field from `package.json`:
```json
"packageManager": "yarn@4.10.3+sha512.c38cafb5c7bb273f3926d04e55e1d8c9dfa7d9c3ea1f36a4868fa028b9e5f72298f0b7f401ad5eb921749eb012eb1c3bb74bf7503df3ee43fd600d14a018266f"
```

And automatically downloads and activates the correct Yarn version.

### Workspace Structure

Your project is a monorepo with workspaces:
```json
"workspaces": [
  "packages/*"
]
```

This requires proper handling of:
- `packages/ansible-language-server/package.json`
- `packages/ansible-mcp-server/package.json`

The fixed Containerfile ensures these are available before running `yarn install`.

## Questions or Issues?

If the build still fails after applying this fix:

1. Check the build logs for the yarn version being used
2. Verify that `.yarnrc.yml` and `.yarn/` directory are present in the container
3. Ensure `corepack prepare` is running successfully
4. Check that all workspace `package.json` files are being copied

## Related Files

- `vscode-ansible.Containerfile` - Original (with debug output added)
- `vscode-ansible.Containerfile.fixed` - Fixed version (recommended)
- `.tekton/vscode-ansible-pull-request.yaml` - Tekton pipeline for PRs
- `.tekton/vscode-ansible-push.yaml` - Tekton pipeline for pushes
- `package.json` - Specifies yarn@4.10.3 as packageManager
- `.yarnrc.yml` - Yarn 4 configuration
- `.yarn/` - Yarn 4 plugins and releases directory

