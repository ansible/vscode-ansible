#!/bin/bash

if [ "$1" == "--coverage" ]; then
  TEST_SCRIPT=coverage-ui-current
else
  TEST_SCRIPT=test-ui-current
fi

# If TEST_LIGHTSPEED_URL is not defined, set a URL with the ipv6 callback hostname,
# which is available in the GitHub Actions Linux environment.
if [[ -z "${TEST_LIGHTSPEED_URL}" ]]; then
  TEST_LIGHTSPEED_URL="http://ip6-localhost:3000"
fi

# Create log dir for express.log
if [ ! -d out/log ]; then
  mkdir out/log
fi

# Start the mock Lightspeed server and run UI tests with the new VS Code
npx start-server-and-test \
    "TEST_LIGHTSPEED_URL=${TEST_LIGHTSPEED_URL} yarn mock-lightspeed-server --ui-test"\
    "${TEST_LIGHTSPEED_URL}" \
    "TEST_LIGHTSPEED_ACCESS_TOKEN=dummy TEST_LIGHTSPEED_URL=${TEST_LIGHTSPEED_URL} yarn ${TEST_SCRIPT}"
