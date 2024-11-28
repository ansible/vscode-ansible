#!/usr/bin/env bash

set -eux
set -o pipefail

cleanup()
{
    if [ -s out/log/express.log ]; then
        echo "FINAL Lightspeed server log:"
        cat out/log/express.log
    fi
    pkill -P $$
    wait
}

trap "cleanup" HUP INT ABRT BUS TERM EXIT


CODE_VERSION="${CODE_VERSION:-max}"
TEST_LIGHTSPEED_URL="${TEST_LIGHTSPEED_URL:-}"
COVERAGE="${COVERAGE:-}"
EXTEST=./node_modules/.bin/extest
MOCK_LIGHTSPEED_API="${MOCK_LIGHTSPEED_API:-}"
TEST_TYPE="${TEST_TYPE:-ui}"  # e2e or ui
COVERAGE_ARG=""


OPTSTRING=":c"

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


if [[ "$MOCK_LIGHTSPEED_API" == "1" ]]; then
    if [[ -n "${TEST_LIGHTSPEED_URL}" ]]; then
        echo "MOCK_LIGHTSPEED_API is true, the existing TEST_LIGHTSPEED_URL envvar will be ignored!"
    fi
    mkdir -p out/log
    TEST_LIGHTSPEED_ACCESS_TOKEN=dummy
    (DEBUG='express:*' node ./out/client/test/mockLightspeedServer/server.js >>out/log/express.log 2>&1 ) &
    sleep 2
    grep 'Listening on port' out/log/express.log
    TEST_LIGHTSPEED_URL=$(sed -n 's,.*Listening on port \([0-9]*\) at \(.*\)".*,http://\2:\1,p' out/log/express.log|tail -n1)
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
    if [ "$(find src test -newer ${vsix})" != "" ]; then
        echo "Rebuilding the vsix package (it was outdated)"
        yarn package
        vsix=$(find . -maxdepth 1 -name '*.vsix')
    fi

    ${EXTEST} install-vsix -f "${vsix}" -e out/ext -s out/test-resources
fi
${EXTEST} install-from-marketplace redhat.vscode-yaml ms-python.python -e out/ext -s out/test-resources


export TEST_LIGHTSPEED_URL
export TEST_LIGHTSPEED_ACCESS_TOKEN
export COVERAGE


cp test/testFixtures/settings.json out/settings.json
if [ "${TEST_LIGHTSPEED_URL}" != "" ]; then
    sed -i.bak "s,https://c.ai.ansible.redhat.com,$TEST_LIGHTSPEED_URL," out/settings.json
fi


if [[ "${TEST_TYPE}" == "ui" ]]; then
    # shellcheck disable=SC2044


    for test_file in $(find out/client/test/ui-test/ -name '*Test.js'); do
        echo "🧐Starting ${test_file}"

        sed -i.bak "s/ansible.lightspeed.enabled": .*/ansible.lightspeed.enabled": false,/" out/settings.json
        if grep "// BEFORE: ansible.lightspeed.enabled: true" "${test_file}"; then
            sed -i.bak "s/ansible.lightspeed.enabled": .*,/ansible.lightspeed.enabled": true,/" out/settings.json
            sed -i.bak "s/ansible.lightspeed.suggestions.enabled: .*,/ansible.lightspeed.suggestions.enabled: true,/" out/settings.json
        fi

        ${EXTEST} run-tests "${COVERAGE_ARG}" -s out/test-resources -e out/ext --code_settings out/settings.json "${test_file}"
        echo "" > out/log/express.log
    done
fi
if [[ "${TEST_TYPE}" == "e2e" ]]; then
    node ./out/client/test/testRunner
fi
