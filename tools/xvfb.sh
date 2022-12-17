#!/bin/bash
# cSpell:ignore servernum
set -e
# On MacOS we do not have xvfb-run but we also do not need one.
if command -v xvfb-run >/dev/null 2>&1; then
    # shellcheck disable=SC2086,SC2048
    xvfb-run --auto-servernum --server-args='-screen 0, 1600x1200x24' -e out/log/xvfb.log $*
else
    # shellcheck disable=SC2086,SC2048
    $*
fi
