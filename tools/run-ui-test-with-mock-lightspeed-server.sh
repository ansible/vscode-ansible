#!/bin/bash

# Start the mock Lightspeed server and run UI tests with the new VS Code
npx start-server-and-test \
    "yarn mock-lightspeed-server" \
    "${TEST_LIGHTSPEED_URL}" \
    "TEST_LIGHTSPEED_ACCESS_TOKEN=dummy yarn test-ui-current"
