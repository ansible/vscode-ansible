#!/bin/bash

# Start the mock Lightspeed server and run e2e tests with code coverage enabled.
npx start-server-and-test \
    "yarn mock-lightspeed-server" \
    "${TEST_LIGHTSPEED_URL}" \
    "TEST_LIGHTSPEED_ACCESS_TOKEN=dummy yarn coverage-e2e"
