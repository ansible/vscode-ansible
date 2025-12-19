#!/usr/bin/env bash
# cspell: ignore nullglob
export DONT_PROMPT_WSL_INSTALL=1
set -euo pipefail

DIR="$(dirname "$(realpath "$0")")"
# shellcheck source=/dev/null
. "$DIR/_utils.sh"

CODE_VERSION="${CODE_VERSION:-max}"
TEST_LIGHTSPEED_PORT=3000
TEST_LIGHTSPEED_URL="${TEST_LIGHTSPEED_URL:-}"
MOCK_LIGHTSPEED_API="${MOCK_LIGHTSPEED_API:-}"
UI_TARGET="${UI_TARGET:-*${1:-}.test.js}"

# shellcheck disable=SC2317
cleanup()
{
    EXIT_CODE=$?
    if [[ $1 != "EXIT" ]]; then
        EXIT_CODE=99
    fi
    log notice "Final clean up"
    # prevents CI issues (git-leaks), also we do not need the html report
    rm -rf out/coverage/*/lcov-report/out
    stop_server

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

function start_server() {
    log notice "Starting the mockLightspeedServer"
    if [[ -n "${TEST_LIGHTSPEED_URL}" ]]; then
        log notice "MOCK_LIGHTSPEED_API is true, the existing TEST_LIGHTSPEED_URL envvar will be ignored!"
    fi
    mkdir -p out/log
    TEST_LIGHTSPEED_ACCESS_TOKEN=dummy
    truncate -s 0 "out/log/${TEST_ID}-express.log"
    truncate -s 0 "out/log/${TEST_ID}-mock-server.log"
    (DEBUG='express:*' node ./out/client/test/ui/mockLightspeedServer/server.js >"out/log/${TEST_ID}-express.log" 2>&1 ) &
    while ! grep 'Listening on port' "out/log/${TEST_ID}-express.log"; do
	sleep 1
    done

    TEST_LIGHTSPEED_URL=$(sed -n 's,.*Listening on port \([0-9]*\) at \(.*\)".*,http://\2:\1,p' "out/log/${TEST_ID}-express.log" | tail -n1)

    export TEST_LIGHTSPEED_ACCESS_TOKEN
    export TEST_LIGHTSPEED_URL
}

function stop_server() {
    if [[ "$MOCK_LIGHTSPEED_API" == "1" ]]; then
        pid=$(lsof -ti :${TEST_LIGHTSPEED_PORT} || true)
        if [ -n "$pid" ]; then
            kill -9 "$pid"
            log debug "Killed process $pid using port ${TEST_LIGHTSPEED_PORT}"
        else
            log debug "No process is using port ${TEST_LIGHTSPEED_PORT}"
        fi
        TEST_LIGHTSPEED_URL=0
    fi
}

function refresh_settings() {
    local test_path=$1
    local test_id=$2
    cp test/testFixtures/settings.json out/settings.json
    sed -i.bak 's/"ansible.lightspeed.enabled": .*/"ansible.lightspeed.enabled": false,/' out/settings.json
    sed -i.bak 's/"ansible.lightspeed.suggestions.enabled": .*/"ansible.lightspeed.suggestions.enabled": false,/' out/settings.json
    if grep "// BEFORE: ansible.lightspeed.enabled: true" "${test_path}"; then
        sed -i.bak 's/"ansible.lightspeed.enabled": .*/"ansible.lightspeed.enabled": true,/' out/settings.json
        sed -i.bak 's/"ansible.lightspeed.suggestions.enabled": .*/"ansible.lightspeed.suggestions.enabled": true,/' out/settings.json
    fi

    if [ "${TEST_LIGHTSPEED_URL}" != "" ]; then
        sed -i.bak "s,https://c.ai.ansible.redhat.com,$TEST_LIGHTSPEED_URL," out/settings.json
    fi
    rm -rf out/test-resources/settings/ >/dev/null
    cp -f out/settings.json "out/log/${test_id}-settings.json"
}

# shellcheck disable=SC2044
find out/client/test/ui/ -name "${UI_TARGET}" -print0 | while IFS= read -r -d '' test_file; do
    basename="${test_file##*/}"
    TEST_ID="${TEST_PREFIX:-ui}-${basename%.*}"
    TEST_JUNIT_FILE="./out/junit/ui/${TEST_ID}-test-results.xml"
    export TEST_ID
    {
        log notice "Testing ${test_file}"
        log notice "Cleaning existing User settings..."
        rm -rfv ./out/test-resources/settings/User/ > /dev/null

        if [[ "$MOCK_LIGHTSPEED_API" == "1" ]]; then
            stop_server
            start_server
        fi
        refresh_settings "${test_file}" "${TEST_ID}"
        # Keep --open_resource here as it is essential as otherwise it will default to use home directory
        # and likely will fail to use our python tools from our own testing virtualenv.
        timeout --kill-after=15 --preserve-status 150s npm exec -- extest run-tests \
            --mocha_config test/ui/.mocharc.js \
            -s out/test-resources \
            -e out/ext \
            --code_settings out/settings.json \
            -c "${CODE_VERSION}" \
            --open_resource . \
            "${EXTEST_ARGS:-}" \
            "${test_file}" || {
                if [[ -f $TEST_JUNIT_FILE ]] && ! grep -o 'failures="[1-9][0-9]*"' "$TEST_JUNIT_FILE"; then
                    log warning "Apparently extest got stuck closing after running test ${TEST_ID} but reported success."
                else
                    echo "${TEST_ID}" >> out/log/.failed;
                fi
            }
        if [[ -f ./out/coverage/ui/cobertura-coverage.xml ]]; then
            mv ./out/coverage/ui/cobertura-coverage.xml "./out/coverage/ui/${TEST_ID}-cobertura-coverage.xml"
        fi
    } | tee >(sed -r "s/\x1B\[[0-9;]*[mK]//g" > "out/log/${TEST_ID}.log") 2>&1
done
ls out/junit/ui/*-test-results.xml 1>/dev/null 2>&1 || { echo "No junit reports files reported, failing the build."; exit 1; }
touch out/junit/ui/.passed
