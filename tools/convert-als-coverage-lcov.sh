#!/bin/bash
mkdir -p out/coverage/als
sed -E -e 's#SF:src/#SF:packages/ansible-language-server/src/#' \
  packages/ansible-language-server/out/coverage.lcov \
  > out/coverage/als/lcov.info
