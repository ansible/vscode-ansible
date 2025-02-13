#!/usr/bin/env bash

set -eu
set -o pipefail

cleanup()
{
    echo "Final clean up"
#    if [ -s out/log/express.log ]; then
#        # cat out/log/express.log
#        # cat out/log/mock-server.log
#    fi
}

trap "cleanup" HUP INT ABRT BUS TERM EXIT


CODE_VERSION="${CODE_VERSION:-max}"
TEST_LIGHTSPEED_URL="${TEST_LIGHTSPEED_URL:-}"
COVERAGE="${COVERAGE:-}"
EXTEST=./node_modules/.bin/extest
MOCK_LIGHTSPEED_API="${MOCK_LIGHTSPEED_API:-}"
TEST_TYPE="${TEST_TYPE:-ui}"  # e2e or ui
COVERAGE_ARG=""
UI_TARGET="${UI_TARGET:-*Test.js}"

OPTSTRING=":c"

function start_server() {
    echo "🚀starting the mockLightspeedServer"
    if [[ -n "${TEST_LIGHTSPEED_URL}" ]]; then
        echo "MOCK_LIGHTSPEED_API is true, the existing TEST_LIGHTSPEED_URL envvar will be ignored!"
    fi
    mkdir -p out/log
    TEST_LIGHTSPEED_ACCESS_TOKEN=dummy
    (DEBUG='express:*' node ./out/client/test/mockLightspeedServer/server.js >>out/log/express.log 2>&1 ) &
    while ! grep 'Listening on port' out/log/express.log; do
	sleep 1
    done

    TEST_LIGHTSPEED_URL=$(sed -n 's,.*Listening on port \([0-9]*\) at \(.*\)".*,http://\2:\1,p' out/log/express.log|tail -n1)

    export TEST_LIGHTSPEED_ACCESS_TOKEN
    export TEST_LIGHTSPEED_URL
}

function stop_server() {
    if [[ "$MOCK_LIGHTSPEED_API" == "1" ]]; then
        curl "${TEST_LIGHTSPEED_URL}/__debug__/kill" || echo "ok"
        echo "" > out/log/express.log
        echo "" > out/log/mock-server.log
    fi
}

function refresh_settings() {
    test_file=$1
    cp test/testFixtures/settings.json out/settings.json
    sed -i.bak 's/"ansible.lightspeed.enabled": .*/"ansible.lightspeed.enabled": false,/' out/settings.json
    sed -i.bak 's/"ansible.lightspeed.suggestions.enabled": .*/"ansible.lightspeed.suggestions.enabled": false,/' out/settings.json
    if grep "// BEFORE: ansible.lightspeed.enabled: true" "${test_file}"; then
        sed -i.bak 's/"ansible.lightspeed.enabled": .*/"ansible.lightspeed.enabled": true,/' out/settings.json
        sed -i.bak 's/"ansible.lightspeed.suggestions.enabled": .*/"ansible.lightspeed.suggestions.enabled": true,/' out/settings.json
    fi

    if [ "${TEST_LIGHTSPEED_URL}" != "" ]; then
        sed -i.bak "s,https://c.ai.ansible.redhat.com,$TEST_LIGHTSPEED_URL," out/settings.json
    fi
}


while getopts ${OPTSTRING} opt; do
    case ${opt} in
        c)
            echo "Coverage enabled"
            COVERAGE="1"
            ;;
        ?)
        echo "Invalid option: -${OPTARG}."
        exit 1
        ;;
    esac
done

if [[ "${COVERAGE}" == "1" ]]; then
    COVERAGE_ARG="--coverage"
fi



# Start the mock Lightspeed server and run UI tests with the new VS Code

${EXTEST} get-vscode -c "${CODE_VERSION}" -s out/test-resources
${EXTEST} get-chromedriver -c "${CODE_VERSION}" -s out/test-resources
if [[ "$COVERAGE" == "" ]]; then
    vsix=$(find . -maxdepth 1 -name '*.vsix')
    if [ -z "${vsix}" ]; then
        echo "Building the vsix package"
        yarn package
        vsix=$(find . -maxdepth 1 -name '*.vsix')
    fi
    # shellcheck disable=SC2086
    if [ "$(find src -newer ${vsix})" != "" ]; then
        echo "Rebuilding the vsix package (it was outdated)"
        yarn package
        vsix=$(find . -maxdepth 1 -name '*.vsix')
    fi
    if [ "$(find test/ui-test/ -newer out/client/test/index.d.ts)" != "" ]; then
	echo "ui-test TypeScript files have been changed. Recompiling!"
	yarn compile
    fi

    ${EXTEST} install-vsix -f "${vsix}" -e out/ext -s out/test-resources
fi
${EXTEST} install-from-marketplace redhat.vscode-yaml ms-python.python -e out/ext -s out/test-resources

export COVERAGE

for i in {1..20}; do
    if [[ "${TEST_TYPE}" == "ui" ]]; then
        test_file="out/client/test/ui-test/lightspeedUiTestPlaybookExpTestNoExpTest.js"
        echo "🧐testing ${test_file} - Iteration $i"

        if [[ "$MOCK_LIGHTSPEED_API" == "1" ]]; then
            start_server
        fi
        refresh_settings "${test_file}"

        TEST_COVERAGE_FILE=./out/coverage/ui/lcov.${test_file##*/}.info
        ${EXTEST} run-tests "${COVERAGE_ARG}" -s out/test-resources -e out/ext --code_settings out/settings.json "${test_file}"

        if [[ -f ./out/coverage/ui/lcov.info ]]; then
            mv ./out/coverage/ui/lcov.info "$TEST_COVERAGE_FILE"
        fi

        stop_server
    fi
done
if [[ "${TEST_TYPE}" == "e2e" ]]; then
    node ./out/client/test/testRunner
fi
