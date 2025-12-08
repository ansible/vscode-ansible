#!/usr/bin/env bash
# cspell: ignore nullglob
export DONT_PROMPT_WSL_INSTALL=1
set -eu
yarn run compile
set -o pipefail

DIR="$(dirname "$(realpath "$0")")"
# shellcheck source=/dev/null
. "$DIR/_utils.sh"

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
    stop_llm_provider_server

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


CODE_VERSION="${CODE_VERSION:-max}"
TEST_LIGHTSPEED_PORT=3000
TEST_LIGHTSPEED_URL="${TEST_LIGHTSPEED_URL:-}"
TEST_LLM_PROVIDER_PORT=3001
TEST_LLM_PROVIDER_URL="${TEST_LLM_PROVIDER_URL:-}"
COVERAGE="${COVERAGE:-}"
MOCK_LIGHTSPEED_API="${MOCK_LIGHTSPEED_API:-}"
MOCK_LLM_PROVIDER_API="${MOCK_LLM_PROVIDER_API:-}"
TEST_TYPE="${TEST_TYPE:-ui}"  # e2e or ui
COVERAGE_ARG=""
UI_TARGET="${UI_TARGET:-*Test.js}"
OPTSTRING=":c"

# https://github.com/microsoft/vscode/issues/204005
rm -f out/log/.failed >/dev/null

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

function start_llm_provider_server() {
    log notice "Starting the LLM Provider Mock Server"
    if [[ -n "${TEST_LLM_PROVIDER_URL}" ]]; then
        log notice "MOCK_LLM_PROVIDER_API is true, the existing TEST_LLM_PROVIDER_URL envvar will be ignored!"
    fi
    mkdir -p out/log
    truncate -s 0 "out/log/${TEST_ID}-llm-provider-server.log"
    (DEBUG='express:*' node ./out/client/test/ui/mockLightspeedLLMProviderServer/server.js >"out/log/${TEST_ID}-llm-provider-server.log" 2>&1 ) &
    while ! grep -i 'listening on port' "out/log/${TEST_ID}-llm-provider-server.log"; do
	sleep 1
    done

    TEST_LLM_PROVIDER_URL=$(sed -n 's,.*Listening on port \([0-9]*\) at \(.*\)$,http://\2:\1,p' "out/log/${TEST_ID}-llm-provider-server.log" | tail -n1)

    export TEST_LLM_PROVIDER_URL
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

function stop_llm_provider_server() {
    if [[ "$MOCK_LLM_PROVIDER_API" == "1" ]]; then
        pid=$(lsof -ti :${TEST_LLM_PROVIDER_PORT} || true)
        if [ -n "$pid" ]; then
            kill -9 "$pid"
            log debug "Killed LLM provider mock server process $pid using port ${TEST_LLM_PROVIDER_PORT}"
        else
            log debug "No process is using port ${TEST_LLM_PROVIDER_PORT}"
        fi
        TEST_LLM_PROVIDER_URL=0
    fi
}

function retry_command() {
    local max_attempts="${1}"
    local delay="${2}"
    local attempt=1
    shift 2
    local command=("$@")

    while [ $attempt -le "$max_attempts" ]; do
        if "${command[@]}"; then
            return 0
        else
            local exit_code=$?
            if [ $attempt -lt "$max_attempts" ]; then
                log warning "Command failed with exit code $exit_code. Retrying in ${delay}s..."
                # Clean up corrupted/partial downloads and unpacked directories
                log notice "Cleaning up potentially corrupted VS Code cache..."
                rm -vf .vscode-test/ out/test-resources/*stable.zip out/test-resources/*.tar.gz || true
                rm -rfv out/test-resources/VSCode-* out/test-resources/"Visual Studio Code.app" || true
                sleep "$delay"
                attempt=$((attempt + 1))
            else
                log error "Command failed after $max_attempts attempts"
                return $exit_code
            fi
        fi
    done
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


while getopts ${OPTSTRING} opt; do
    case ${opt} in
        c)
            log notice "Coverage enabled"
            COVERAGE="1"
            ;;
        ?)
        log error "Invalid option: -${OPTARG}."
        exit 1
        ;;
    esac
done

if [[ "${COVERAGE}" == "1" ]]; then
    COVERAGE_ARG="--coverage"
fi



# Start the mock Lightspeed server and run UI tests with the new VS Code

retry_command 3 2 extest get-vscode -c "${CODE_VERSION}" -s out/test-resources

log notice "Downloading ChromeDriver..."
retry_command 3 2 extest get-chromedriver -c "${CODE_VERSION}" -s out/test-resources

# Pre-pull ansible-navigator container image for UI tests (non-macOS only)
if [[ "$OSTYPE" != "darwin"* ]]; then
    CONTAINER_ENGINE=${CONTAINER_ENGINE:-podman}
    ANSIBLE_IMAGE="ghcr.io/ansible/community-ansible-dev-tools:latest"

    log notice "Pre-pulling container image for ansible-navigator tests..."
    if command -v "$CONTAINER_ENGINE" &> /dev/null; then
        if $CONTAINER_ENGINE pull "$ANSIBLE_IMAGE" 2>&1 | tee /dev/stderr; then
            log notice "Container image pulled successfully"
        else
            log warning "Failed to pull container image, tests may be slower"
        fi
    else
        log warning "$CONTAINER_ENGINE not found, skipping container image pre-pull"
    fi
fi
if [[ "$COVERAGE" == "" ]]; then
    vsix=$(find . -maxdepth 1 -name '*.vsix')
    if [ -z "${vsix}" ]; then
        log notice "Building the vsix package"
        yarn package
        vsix=$(find . -maxdepth 1 -name '*.vsix')
    fi
    # shellcheck disable=SC2086
    if [ "$(find src -newer ${vsix})" != "" ]; then
        log notice "Rebuilding the vsix package (it was outdated)"
        yarn package
        vsix=$(find . -maxdepth 1 -name '*.vsix')
    fi
    yarn compile

    extest install-vsix -f "${vsix}" -e out/ext -s out/test-resources
fi
extest install-from-marketplace redhat.vscode-yaml ms-python.python -e out/ext -s out/test-resources

export COVERAGE

if [[ "${TEST_TYPE}" == "ui" ]]; then
    # shellcheck disable=SC2044
    rm -f out/junit/ui/*.* >/dev/null
    mkdir -p out/log/ui

    find out/client/test/ui/ -name "${UI_TARGET}" -print0 | while IFS= read -r -d '' test_file; do
        basename="${test_file##*/}"
        TEST_ID="ui-${basename%.*}"
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
            if [[ "$MOCK_LLM_PROVIDER_API" == "1" ]]; then
                stop_llm_provider_server
                start_llm_provider_server
            fi
            refresh_settings "${test_file}" "${TEST_ID}"
            export TEST_LLM_PROVIDER_URL
            timeout --kill-after=15 --preserve-status 150s npm exec -- extest run-tests "${COVERAGE_ARG}" \
                --mocha_config test/ui/.mocharc.js \
                -s out/test-resources \
                -e out/ext \
                --code_settings out/settings.json \
                -c "${CODE_VERSION}" \
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
            src_dir="out/test-resources/screenshots"
            if [ -d "$src_dir" ]; then
                shopt -s nullglob
                files=("$src_dir"/*.png)
                shopt -u nullglob
                if [ ${#files[@]} -gt 0 ]; then
                    mv "${files[@]}" "out/log/"
                fi
            fi
        } | tee >(sed -r "s/\x1B\[[0-9;]*[mK]//g" > "out/log/ui/${TEST_ID}.log") 2>&1
    done
    ls out/junit/ui/*-test-results.xml 1>/dev/null 2>&1 || { echo "No junit reports files reported, failing the build."; exit 1; }
    touch out/junit/ui/.passed
fi
