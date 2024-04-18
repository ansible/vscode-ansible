#!/bin/bash

if [ "$1" == "--coverage" ]; then
  TEST_SCRIPT=coverage-ui-current
else
  TEST_SCRIPT=test-ui-current
fi

# Create log dir for express.log
if [ ! -d out/log ]; then
  mkdir out/log
fi

# Start the mock Lightspeed server and run UI tests with the new VS Code
npx start-server-and-test \
    "yarn mock-lightspeed-server --ui-test" \
    "${TEST_LIGHTSPEED_URL}" \
    "TEST_LIGHTSPEED_ACCESS_TOKEN=dummy yarn ${TEST_SCRIPT}"
