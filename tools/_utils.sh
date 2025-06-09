#!/bin/bash
set -euo pipefail

NC='\033[0m' # No Color

timed() {
  local start
  start=$(date +%s)
  local exit_code
  exit_code=0
  "$@" || exit_code=$?
  echo >&2 "took ~$(($(date +%s)-start)) seconds. exited with ${exit_code}"
  return $exit_code
}

# Use "log [notice|warning|error] message" to  print a colored message to
# stderr, with colors.
log () {
    local prefix
    if [ "$#" -ne 2 ]; then
        log error "Incorrect call ($*), use: log [notice|warning|error] 'message'."
        exit 2
    fi
    case $1 in
        debug) prefix='\033[90mDEBUG:   ' ;;
        notice) prefix='\033[0;36mNOTICE:  ' ;;
        warning) prefix='\033[0;33mWARNING: ' ;;
        error) prefix='\033[0;31mERROR:   ' ;;
        *)
        log error "log first argument must be 'debug', 'notice', 'warning' or 'error', not $1."
        exit 2
        ;;
    esac
    echo >&2 -e "${prefix}${2}${NC}"
}
