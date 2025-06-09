#!/bin/bash
set -euxo pipefail
DIR=$1
for FILE in "$DIR"/*.*; do
    # x265 seems 30% smaller than x264
    # "-tag:v hvc1" needed for macos compatibility (preview)
    ffmpeg -y -hide_banner -loglevel warning -stats -i "$FILE" -c:v libx265 -x265-params log-level=warning -preset slow -crf 28 -tag:v hvc1 "$(basename "$FILE")"
done
