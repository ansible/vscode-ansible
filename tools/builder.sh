#!/bin/bash
# This script is used to build the container image for the vscode-ansible repository.
# cspell:ignore hardlinks
# cspell:disable-next-line
set -euo pipefail

DIR="$(dirname "$(realpath "$0")")"
# shellcheck source=/dev/null
. "$DIR/_utils.sh"
IMAGE_TAG="ghcr.io/ansible/ext-builder:latest"

# Parse command line arguments
PUSH_IMAGE=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --push)
      PUSH_IMAGE=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--push]"
      exit 1
      ;;
  esac
done

log notice "Building container image..."
docker build --output type=docker,name=$IMAGE_TAG,compression=gzip --build-arg GITHUB_TOKEN="${GITHUB_TOKEN:-}" -f Containerfile -t $IMAGE_TAG .
docker image ls $IMAGE_TAG

log notice "Preparing code for container build testing..."
set -x
# copy tracked files to a temporary directory to avoid affecting container building
git config --list --show-origin
git status
rm -rf out/context
mkdir -p out/context
git config advice.detachedHead false
git clone --template= --no-hardlinks . out/context/

log notice "Running build inside the container..."
docker run --rm -e GITHUB_TOKEN -v "$PWD/out/context:/context" $IMAGE_TAG exec -- task build

if [ "$PUSH_IMAGE" = true ]; then
  log notice "Pushing container image..."
  docker push $IMAGE_TAG
fi
SIZE=$(docker inspect -f "{{ .Size }}" "$IMAGE_TAG" | awk '{print $1/1024/1024}')
log notice "Done building ${IMAGE_TAG} with size: ${SIZE}MB"
