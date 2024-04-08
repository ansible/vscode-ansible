#!/bin/bash

# If TEST_LIGHTSPEED_URL is not defined, set a URL with the ipv6 callback hostname,
# which is available in the GitHub Actions Linux environment.
if [[ -z "${TEST_LIGHTSPEED_URL}" ]]; then
  TEST_LIGHTSPEED_URL="http://ip6-localhost:3000"
fi

# Start the mock Lightspeed server and run UI tests with the new VS Code
npx start-server-and-test \
    "TEST_LIGHTSPEED_URL=${TEST_LIGHTSPEED_URL} yarn mock-lightspeed-server" \
    "${TEST_LIGHTSPEED_URL}" \
    "TEST_LIGHTSPEED_ACCESS_TOKEN=dummy TEST_LIGHTSPEED_URL=${TEST_LIGHTSPEED_URL} yarn test-ui-current"
