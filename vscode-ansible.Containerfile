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

# Debug: Verify Yarn files are present
RUN echo "=== DEBUG: Checking Yarn configuration ===" && \
    ls -lh .yarnrc.yml && \
    echo "=== DEBUG: Yarn releases directory ===" && \
    ls -lh .yarn/releases/ && \
    echo "=== DEBUG: Corepack version ===" && \
    corepack --version

# Copy package.json and yarn.lock for dependency installation
COPY package.json yarn.lock ./

# Debug: Verify package files
RUN echo "=== DEBUG: Package files ===" && \
    ls -lh package.json yarn.lock && \
    echo "=== DEBUG: packageManager field ===" && \
    grep packageManager package.json

# Prepare yarn - this will use the version specified in packageManager field
RUN echo "=== DEBUG: Running corepack prepare ===" && \
    corepack prepare && \
    echo "=== DEBUG: Yarn version after prepare ===" && \
    yarn --version

# Copy workspace package.json files (for monorepo)
COPY packages ./packages

# Debug: Verify workspace structure
RUN echo "=== DEBUG: Workspace packages ===" && \
    ls -la packages/

# Install dependencies using the correct yarn version
RUN echo "=== DEBUG: Starting yarn install ===" && \
    yarn install --immutable && \
    echo "=== DEBUG: Yarn install completed ===" && \
    ls -ld node_modules

# Copy the rest of the application
COPY . .

# Debug: Verify full directory structure
RUN echo "=== DEBUG: Full directory listing ===" && \
    ls -la && \
    echo "=== DEBUG: Checking tools/helper ===" && \
    ls -lh tools/helper 2>/dev/null || echo "tools/helper not found"

# Run the package script
RUN echo "=== DEBUG: Running yarn package ===" && \
    yarn run package && \
    echo "=== DEBUG: Package completed, checking output ===" && \
    ls -lh *.vsix 2>/dev/null || echo "No .vsix file found"
