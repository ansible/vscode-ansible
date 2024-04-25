#!/bin/bash
find out/server -name "*.js.map" -exec bash -c "sed -E -e 's#(\.\./\.\./\.\.)/(src|test|tools)/#\1/packages/ansible-language-server/\2/#' \$1 > \$1.tmp && mv \$1.tmp \$1" - {} \;
