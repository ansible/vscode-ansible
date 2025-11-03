#!/bin/bash
# This script is used to build the container image for the vscode-ansible repository.
# cspell:disable-next-line
set -euox pipefail

DIR="$(dirname "$(realpath "$0")")"
# shellcheck source=/dev/null
. "$DIR/_utils.sh"
IMAGE_TAG="ghcr.io/ansible/ext-builder:latest"

log notice "Building container image..."
docker build -f Containerfile -t $IMAGE_TAG .
docker image ls $IMAGE_TAG

log notice "Running container image..."
docker run -e MISE_TRUSTED_CONFIG_PATHS=/ -v "$PWD:/context" -it $IMAGE_TAG exec -- df
