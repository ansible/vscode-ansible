#!/bin/bash
# This script is used to build the container image for the vscode-ansible repository.
# cspell:disable-next-line
set -euo pipefail

DIR="$(dirname "$(realpath "$0")")"
# shellcheck source=/dev/null
. "$DIR/_utils.sh"
IMAGE_TAG="ghcr.io/ansible/ext-builder:latest"

log notice "Building container image..."
docker build --build-arg GITHUB_TOKEN="${GITHUB_TOKEN:-}" -f Containerfile -t $IMAGE_TAG .
docker image ls $IMAGE_TAG

log notice "Running build using container image..."
docker run --rm -e GITHUB_TOKEN -v "$PWD:/context" -it $IMAGE_TAG exec -- task build
