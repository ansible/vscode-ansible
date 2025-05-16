# Use an official Node.js runtime as a parent image
# Ensure it matches the version specified in package.json engines.node (>=20.0)
FROM node:lts-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Enable Corepack to manage Yarn (for Yarn >=2, as specified in package.json engines.yarn >=4.5.1)
RUN corepack enable

# Copy package.json and yarn.lock to leverage Docker cache
# yarn.lock is crucial for reproducible builds with Yarn
COPY package.json yarn.lock ./

# Install project dependencies using Yarn
# --frozen-lockfile ensures that yarn.lock is not modified (for Yarn Classic)
# For Yarn Modern (>=2), this is equivalent to 'yarn install --immutable' if a lockfile is present
RUN yarn install --frozen-lockfile

# Copy the rest of the application's source code
COPY . .

# Run the script that packages the extension into a .vsix file
# This script is defined in package.json as:
# "package": "NODE_OPTIONS='--max-old-space-size=8192' ./tools/helper --package"
# This will trigger the necessary build and packaging process.
RUN yarn package

# The .vsix file (e.g., redhat.ansible-X.Y.Z.vsix) will be generated in the WORKDIR (/usr/src/app/)
