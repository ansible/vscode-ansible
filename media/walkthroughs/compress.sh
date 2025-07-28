#!/bin/bash
set -euxo pipefail
DIR=$1
for FILE in "$DIR"/*.*; do
    # x264 required for vscode rendering support
    ffmpeg -y -hide_banner -loglevel warning -stats -i "$FILE" -c:v libx264 -crf 23 -preset veryslow "$(basename "$FILE")"
done
