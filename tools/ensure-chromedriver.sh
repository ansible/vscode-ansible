#!/usr/bin/env bash
# Workaround: Node.js 24.16's "harden ClientRequest options merge" breaks
# WebdriverIO 8's chromedriver download via @puppeteer/browsers.
# This script pre-installs chromedriver using curl so the framework finds it
# at the expected path and skips its own (broken) download.
#
# Remove this script once WebdriverIO 9 migration lands.
set -euo pipefail

CACHE_DIR="${CHROMEDRIVER_CACHE_DIR:-/tmp}"

# Resolve current stable VS Code version
VSCODE_VERSION=$(curl -sf "https://update.code.visualstudio.com/api/releases/stable" | python3 -c "import sys,json; print(json.load(sys.stdin)[0])")

# Get the Chromium major version from VS Code's cgmanifest
CHROMIUM_MAJOR=$(curl -sf "https://raw.githubusercontent.com/microsoft/vscode/${VSCODE_VERSION}/cgmanifest.json" \
  | python3 -c "
import sys, json
m = json.load(sys.stdin)
for r in m['registrations']:
    if r['component']['git']['name'] == 'chromium':
        print(r['version'].split('.')[0])
        break
")

if [[ -z "${CHROMIUM_MAJOR}" ]]; then
  echo "ERROR: Could not determine Chromium major version for VS Code ${VSCODE_VERSION}" >&2
  exit 1
fi

# Resolve the actual chromedriver build ID via Chrome for Testing API
# (same endpoint @puppeteer/browsers uses internally)
CHROMEDRIVER_VERSION=$(curl -sf "https://googlechromelabs.github.io/chrome-for-testing/latest-versions-per-milestone.json" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['milestones']['${CHROMIUM_MAJOR}']['version'])")

if [[ -z "${CHROMEDRIVER_VERSION}" ]]; then
  echo "ERROR: No chromedriver available for Chromium milestone ${CHROMIUM_MAJOR}" >&2
  exit 1
fi

# Determine platform folder used by @puppeteer/browsers
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)  PLATFORM="linux"; FOLDER="linux64" ;;
  Darwin-arm64)  PLATFORM="mac"; FOLDER="mac-arm64" ;;
  Darwin-x86_64) PLATFORM="mac"; FOLDER="mac-x64" ;;
  *)             echo "Unsupported platform: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

DRIVER_DIR="${CACHE_DIR}/chromedriver/${PLATFORM}-${CHROMEDRIVER_VERSION}"
DRIVER_BIN="${DRIVER_DIR}/chromedriver-${FOLDER}/chromedriver"

if [[ -x "${DRIVER_BIN}" ]]; then
  echo "Chromedriver ${CHROMEDRIVER_VERSION} already available at ${DRIVER_BIN}"
  exit 0
fi

echo "Downloading chromedriver ${CHROMEDRIVER_VERSION} for ${PLATFORM}/${FOLDER}..."
mkdir -p "${DRIVER_DIR}"
DOWNLOAD_URL="https://storage.googleapis.com/chrome-for-testing-public/${CHROMEDRIVER_VERSION}/${FOLDER}/chromedriver-${FOLDER}.zip"

TMPZIP=$(mktemp)
trap 'rm -f "${TMPZIP}"' EXIT

if ! curl -sfL "${DOWNLOAD_URL}" -o "${TMPZIP}"; then
  echo "ERROR: Failed to download chromedriver from ${DOWNLOAD_URL}" >&2
  exit 1
fi

unzip -qo "${TMPZIP}" -d "${DRIVER_DIR}/"
chmod +x "${DRIVER_BIN}"
echo "Chromedriver ${CHROMEDRIVER_VERSION} installed at ${DRIVER_BIN}"
