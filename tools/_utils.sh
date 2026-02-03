#!/bin/bash
set -euo pipefail

timed() {
  local start
  start=$(date +%s)
  local exit_code
  exit_code=0
  "$@" || exit_code=$?
  echo >&2 "took ~$(($(date +%s)-start)) seconds. exited with ${exit_code}"
  return $exit_code
}

if [[ "${READTHEDOCS:-}" != "True" ]]; then
    NC='\033[0m' # No Color
    DEBUG_COLOR='\033[90m'
    NOTICE_COLOR='\033[0;36m'
    WARNING_COLOR='\033[0;33m'
    ERROR_COLOR='\033[0;31m'
else
    NC=''
    DEBUG_COLOR=''
    NOTICE_COLOR=''
    WARNING_COLOR=''
    ERROR_COLOR=''
    # see https://github.com/readthedocs/readthedocs.org/issues/8733
    # shellcheck disable=SC2034
    unset FORCE_COLOR=0
    # shellcheck disable=SC2034
    NO_COLOR=1
fi
# Use "log [notice|warning|error] message" to  print a colored message to
# stderr, with colors.
log () {
    local prefix
    if [ "$#" -ne 2 ]; then
        log error "Incorrect call ($*), use: log [notice|warning|error] 'message'."
        exit 2
    fi
    case $1 in
        debug) prefix="${DEBUG_COLOR}DEBUG:   " ;;
        notice) prefix="${NOTICE_COLOR}NOTICE:  " ;;
        warning) prefix="${WARNING_COLOR}WARNING: " ;;
        error) prefix="${ERROR_COLOR}ERROR:   " ;;
        *)
        log error "log first argument must be 'debug', 'notice', 'warning' or 'error', not $1."
        exit 2
        ;;
    esac
    echo >&2 -e "${prefix}${2}${NC}"
}
