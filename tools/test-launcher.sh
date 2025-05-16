#!/usr/bin/env bash

export DONT_PROMPT_WSL_INSTALL=1
set -eu
yarn run compile
set -o pipefail

cleanup()
{
    echo "Final clean up"
    stop_server
}

trap "cleanup" HUP INT ABRT BUS TERM EXIT


CODE_VERSION="${CODE_VERSION:-max}"
TEST_LIGHTSPEED_URL="${TEST_LIGHTSPEED_URL:-}"
COVERAGE="${COVERAGE:-}"
MOCK_LIGHTSPEED_API="${MOCK_LIGHTSPEED_API:-}"
TEST_TYPE="${TEST_TYPE:-ui}"  # e2e or ui
COVERAGE_ARG=""
UI_TARGET="${UI_TARGET:-*Test.js}"

OPTSTRING=":c"

# https://github.com/microsoft/vscode/issues/204005
unset NODE_OPTIONS


function start_server() {
    echo "🚀starting the mockLightspeedServer"
    if [[ -n "${TEST_LIGHTSPEED_URL}" ]]; then
        echo "MOCK_LIGHTSPEED_API is true, the existing TEST_LIGHTSPEED_URL envvar will be ignored!"
    fi
    mkdir -p out/log
    TEST_LIGHTSPEED_ACCESS_TOKEN=dummy
    (DEBUG='express:*' node ./out/client/test/ui/mockLightspeedServer/server.js >>out/log/express.log 2>&1 ) &
    while ! grep 'Listening on port' out/log/express.log; do
	sleep 1
    done

    TEST_LIGHTSPEED_URL=$(sed -n 's,.*Listening on port \([0-9]*\) at \(.*\)".*,http://\2:\1,p' out/log/express.log|tail -n1)

    export TEST_LIGHTSPEED_ACCESS_TOKEN
    export TEST_LIGHTSPEED_URL
}

function stop_server() {
    if [[ "$MOCK_LIGHTSPEED_API" == "1" ]]; then
        curl --silent "${TEST_LIGHTSPEED_URL}/__debug__/kill" || echo "ok"
        touch out/log/express.log out/log/mock-server.log
        cat out/log/express.log >> out/log/express-full.log
        cat out/log/mock-server.log >> out/log/mock-server-full.log
        echo "" > out/log/express.log
        echo "" > out/log/mock-server.log
        TEST_LIGHTSPEED_URL=0
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
    rm -rf out/test-resources/settings/

    jq < out/settings.json
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

npm exec -- extest get-vscode -c "${CODE_VERSION}" -s out/test-resources
npm exec -- extest get-chromedriver -c "${CODE_VERSION}" -s out/test-resources
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
    yarn compile

    npm exec -- extest install-vsix -f "${vsix}" -e out/ext -s out/test-resources
fi
npm exec -- extest install-from-marketplace redhat.vscode-yaml ms-python.python -e out/ext -s out/test-resources

export COVERAGE

if [[ "${TEST_TYPE}" == "ui" ]]; then
    # shellcheck disable=SC2044

    for test_file in $(find out/client/test/ui/ -name "${UI_TARGET}"); do
        echo "🧐testing ${test_file}"
        basename="${test_file##*/}"
        echo "  cleaning existing User settings..."
        rm -rfv ./out/test-resources/settings/User/

        if [[ "$MOCK_LIGHTSPEED_API" == "1" ]]; then
            stop_server
            start_server
        fi
        refresh_settings "${test_file}"
        npm exec -- extest run-tests "${COVERAGE_ARG}" \
            -s out/test-resources \
            -e out/ext \
            --code_settings out/settings.json \
            -c "${CODE_VERSION}" \
            "${test_file}"

        if [[ -f ./out/coverage/ui/cobertura-coverage.xml ]]; then
            mv ./out/coverage/ui/cobertura-coverage.xml "./out/coverage/ui/${basename%.*}-cobertura-coverage.xml"
        fi
    done
fi
if [[ "${TEST_TYPE}" == "e2e" ]]; then
    export NODE_NO_WARNINGS=1
    export DONT_PROMPT_WSL_INSTALL=1
    export SKIP_PODMAN=${SKIP_PODMAN:-0}
    export SKIP_DOCKER=${SKIP_DOCKER:-0}

    mkdir -p out/userdata/User/
    cp -f test/testFixtures/settings.json out/userdata/User/settings.json
    # no not try to use junit reporter here as it gives an internal error, but it works well when setup as the sole mocha reporter inside .vscode-test.mjs file
    npm exec -- vscode-test --coverage --coverage-output ./out/coverage/e2e --coverage-reporter text --coverage-reporter cobertura
fi
