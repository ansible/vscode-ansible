#!/bin/bash

# If TEST_LIGHTSPEED_URL is not defined, set a URL with the ipv6 callback hostname,
# which is available in the GitHub Actions Linux environment.
if [[ -z "${TEST_LIGHTSPEED_URL}" ]]; then
  TEST_LIGHTSPEED_URL="http://ip6-localhost:3000"
fi

# Create log dir for express.log
if [ ! -d out/log ]; then
  mkdir out/log
fi

# Start the mock Lightspeed server and run e2e tests with code coverage enabled.
npx start-server-and-test \
    "TEST_LIGHTSPEED_URL=${TEST_LIGHTSPEED_URL} yarn mock-lightspeed-server" \
    "${TEST_LIGHTSPEED_URL}" \
    "TEST_LIGHTSPEED_ACCESS_TOKEN=dummy TEST_LIGHTSPEED_URL=${TEST_LIGHTSPEED_URL} yarn coverage-e2e"
