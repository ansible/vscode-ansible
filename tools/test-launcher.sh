#!/usr/bin/env bash
# cspell: ignore nullglob
export DONT_PROMPT_WSL_INSTALL=1
set -euo pipefail

DIR="$(dirname "$(realpath "$0")")"
# shellcheck source=/dev/null
. "$DIR/_utils.sh"

CODE_VERSION="${CODE_VERSION:-max}"
UI_TARGET="${UI_TARGET:-*${1:-}.test.js}"

# shellcheck disable=SC2317
cleanup()
{
    EXIT_CODE=$?
    if [[ $1 != "EXIT" ]]; then
        EXIT_CODE=99
    fi
    log debug "Final clean up"
    # prevents CI issues (git-leaks), also we do not need the html report
    rm -rf out/coverage/*/lcov-report/out

    if [[ -f out/log/.failed ]]; then
         EXIT_CODE=3
         MSG=$(tr '\n' ', ' < out/log/.failed)
    fi

    if [[ $EXIT_CODE -ne 0 ]]; then
        log error "Test run failed with exit code ${EXIT_CODE}. One or more tests failed ${MSG:-}"
    else
        log notice "All tests passed"
    fi
    trap - EXIT
    exit $EXIT_CODE
}

trap "cleanup OTHER" HUP INT ABRT BUS TERM
trap "cleanup EXIT" EXIT
rm -f out/log/.failed || true

# shellcheck disable=SC2044
find out/client/test/ui/ -name "${UI_TARGET}" -print0 | while IFS= read -r -d '' test_file; do
    basename="${test_file##*/}"
    TEST_ID="${TEST_PREFIX:-ui}-${basename%.*}"
    export TEST_ID
    {
        log notice "Testing ${test_file}"
        log debug "Cleaning existing User settings..."
        rm -rfv ./out/test-resources/settings/User/ > /dev/null
        mkdir -p out/test-resources/settings/User/

        # cp -f test/testFixtures/settings.json out/workspace/settings.json
        cp -f test/testFixtures/settings.json out/test-resources/settings/User/settings.json
        # Keep --open_resource here as it is essential as otherwise it will default to use home directory
        # and likely will fail to use our python tools from our own testing virtualenv.
        # --code_settings out/test-resources/settings/User/settings.json \
        # --code_settings out/workspace/settings.json \
       timeout --kill-after=15 --preserve-status 150s npm exec -- extest run-tests \
            --mocha_config test/ui/.mocharc.js \
            -s out/test-resources \
            -e out/ext \
            --code_settings out/test-resources/settings/User/settings.json \
            -c "${CODE_VERSION}" \
            --open_resource . \
            "${EXTEST_ARGS:-}" \
            -- \
            "${test_file}" || echo "${TEST_ID}" >> out/log/.failed

        if [[ -f ./out/coverage/ui/cobertura-coverage.xml ]]; then
            mv ./out/coverage/ui/cobertura-coverage.xml "./out/coverage/ui/${TEST_ID}-cobertura-coverage.xml"
        fi
    } | tee >(sed -r "s/\x1B\[[0-9;]*[mK]//g" > "out/log/${TEST_ID}.log") 2>&1
done
ls out/junit/ui/*-test-results.xml 1>/dev/null 2>&1 || { echo "No junit reports files reported, failing the build."; exit 1; }
touch out/junit/ui/.passed
