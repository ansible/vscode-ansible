#!/bin/sh
SED_COMMAND="sed -E -e \
's#\.\./\.\./\.\./(src|test|tools)/#\.\./\.\./\.\./packages/ansible-language-server/\1/#' \
{} > {}.tmp && mv {}.tmp {}"
find out/server -name '*.js.map' -print0 | xargs -0 -I {} sh -c "${SED_COMMAND}"
