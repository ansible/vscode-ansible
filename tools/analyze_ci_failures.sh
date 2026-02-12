#!/bin/bash

# Script to analyze CI failures related to test_lightspeed.py or test_lightspeed_trial.py
# For the last 3 days of workflow runs

WORKFLOW="ci.yaml"
DAYS_BACK=3
OUTPUT_FILE="ci_failure_report.md"
TEMP_DIR=$(mktemp -d)

trap "rm -rf $TEMP_DIR" EXIT

echo "# CI Failure Analysis Report" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "Analysis of failures in \`$WORKFLOW\` for the last $DAYS_BACK days" >> "$OUTPUT_FILE"
echo "Generated on: $(date -u +"%Y-%m-%d %H:%M:%S UTC")" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Calculate timestamp for N days ago
CUTOFF_DATE=$(date -u -d "$DAYS_BACK days ago" --iso-8601=seconds)

echo "Fetching workflow runs from the last $DAYS_BACK days..."

# Get all workflow runs from the last 5 days
gh run list --workflow="$WORKFLOW" --limit 200 --json databaseId,conclusion,createdAt,displayTitle,headBranch,event,url \
    | jq -r --arg cutoff "$CUTOFF_DATE" '.[] | select(.createdAt > $cutoff)' \
    > "$TEMP_DIR/runs.json"

TOTAL_RUNS=$(jq -s 'length' < "$TEMP_DIR/runs.json")
FAILED_RUNS=$(jq -s '[.[] | select(.conclusion == "failure")] | length' < "$TEMP_DIR/runs.json")
SUCCESS_RUNS=$(jq -s '[.[] | select(.conclusion == "success")] | length' < "$TEMP_DIR/runs.json")
CANCELLED_RUNS=$(jq -s '[.[] | select(.conclusion == "cancelled")] | length' < "$TEMP_DIR/runs.json")

echo "## Summary" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "- **Total runs**: $TOTAL_RUNS" >> "$OUTPUT_FILE"
echo "- **Successful**: $SUCCESS_RUNS" >> "$OUTPUT_FILE"
echo "- **Failed**: $FAILED_RUNS" >> "$OUTPUT_FILE"
echo "- **Cancelled**: $CANCELLED_RUNS" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Get failed run IDs
jq -r 'select(.conclusion == "failure") | .databaseId' < "$TEMP_DIR/runs.json" > "$TEMP_DIR/failed_runs.txt"

LIGHTSPEED_FAILURES=0
OTHER_FAILURES=0

# Create files for categorized runs
> "$TEMP_DIR/lightspeed_runs.txt"
> "$TEMP_DIR/other_runs.txt"

if [ ! -s "$TEMP_DIR/failed_runs.txt" ]; then
    echo "No failed runs found in the last $DAYS_BACK days." >> "$OUTPUT_FILE"
else
    echo "Analyzing $(wc -l < "$TEMP_DIR/failed_runs.txt") failed runs..."

    RUN_COUNT=0
    TOTAL_FAILED=$(wc -l < "$TEMP_DIR/failed_runs.txt")

    while read -r RUN_ID; do
        ((RUN_COUNT++))
        echo "[$RUN_COUNT/$TOTAL_FAILED] Analyzing run $RUN_ID..."

        # Get run details from cached JSON
        RUN_INFO=$(jq -r --arg id "$RUN_ID" 'select(.databaseId == ($id | tonumber))' < "$TEMP_DIR/runs.json")

        RUN_TITLE=$(echo "$RUN_INFO" | jq -r '.displayTitle')
        RUN_BRANCH=$(echo "$RUN_INFO" | jq -r '.headBranch')
        RUN_URL=$(echo "$RUN_INFO" | jq -r '.url')
        RUN_DATE=$(echo "$RUN_INFO" | jq -r '.createdAt')

        # Get failed jobs for this run
        gh run view "$RUN_ID" --json jobs > "$TEMP_DIR/jobs_${RUN_ID}.json" 2>/dev/null || {
            echo "  Warning: Could not fetch jobs for run $RUN_ID"
            continue
        }

        FAILED_JOB_NAMES=$(jq -r '.jobs[] | select(.conclusion == "failure") | .name' < "$TEMP_DIR/jobs_${RUN_ID}.json")

        if [ -z "$FAILED_JOB_NAMES" ]; then
            echo "  No failed jobs found"
            continue
        fi

        FOUND_LIGHTSPEED=false

        # Check each failed job
        while read -r JOB_NAME; do
            if [ -z "$JOB_NAME" ]; then
                continue
            fi

            JOB_ID=$(jq -r --arg name "$JOB_NAME" '.jobs[] | select(.name == $name) | .databaseId' < "$TEMP_DIR/jobs_${RUN_ID}.json")

            echo "  Checking job: $JOB_NAME (ID: $JOB_ID)"

            # Fetch job log with timeout
            timeout 30s gh run view --job "$JOB_ID" --log > "$TEMP_DIR/log_${JOB_ID}.txt" 2>/dev/null || {
                echo "    Warning: Could not fetch log for job $JOB_ID (timeout or error)"
                continue
            }

            # Search for lightspeed test failures (not just mentions)
            # Match patterns like "FAILED test/.../test_lightspeed.py::test_name" or "test_lightspeed.py::test_name FAILED"
            if grep -qE "FAILED.*(test_lightspeed\.py|test_lightspeed_trial\.py)|(test_lightspeed\.py|test_lightspeed_trial\.py).*FAILED|ERROR.*(test_lightspeed\.py|test_lightspeed_trial\.py)" "$TEMP_DIR/log_${JOB_ID}.txt"; then
                echo "    Found lightspeed test FAILURE!"
                FOUND_LIGHTSPEED=true

                # Save details including JOB_ID for log URL
                echo "$RUN_ID|$RUN_TITLE|$RUN_BRANCH|$RUN_URL|$RUN_DATE|$JOB_NAME|$JOB_ID" >> "$TEMP_DIR/lightspeed_runs.txt"

                # Extract failure context
                grep -E -A 10 -B 5 "FAILED.*(test_lightspeed\.py|test_lightspeed_trial\.py)|(test_lightspeed\.py|test_lightspeed_trial\.py).*FAILED|ERROR.*(test_lightspeed\.py|test_lightspeed_trial\.py)" "$TEMP_DIR/log_${JOB_ID}.txt" \
                    > "$TEMP_DIR/failure_${RUN_ID}_${JOB_ID}.txt" 2>/dev/null || true

                break  # Found it, no need to check other jobs for this run
            fi

            # Clean up log file to save space
            rm -f "$TEMP_DIR/log_${JOB_ID}.txt"
        done <<< "$FAILED_JOB_NAMES"

        if [ "$FOUND_LIGHTSPEED" = true ]; then
            ((LIGHTSPEED_FAILURES++))
        else
            ((OTHER_FAILURES++))
            FAILED_JOBS_CSV=$(echo "$FAILED_JOB_NAMES" | tr '\n' ',' | sed 's/,$//')
            echo "$RUN_ID|$RUN_TITLE|$RUN_BRANCH|$RUN_URL|$RUN_DATE|$FAILED_JOBS_CSV" >> "$TEMP_DIR/other_runs.txt"
        fi

    done < "$TEMP_DIR/failed_runs.txt"
fi

# Generate report sections
echo "## Detailed Analysis" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "### Failures Related to Lightspeed Tests" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

if [ ! -s "$TEMP_DIR/lightspeed_runs.txt" ]; then
    echo "No failures related to lightspeed tests found." >> "$OUTPUT_FILE"
else
    while IFS='|' read -r RUN_ID RUN_TITLE RUN_BRANCH RUN_URL RUN_DATE JOB_NAME JOB_ID; do
        # Construct the job log URL
        JOB_LOG_URL="https://github.com/ansible/vscode-ansible/actions/runs/${RUN_ID}/job/${JOB_ID}"

        echo "#### Run #$RUN_ID - $RUN_TITLE" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        echo "- **Branch**: \`$RUN_BRANCH\`" >> "$OUTPUT_FILE"
        echo "- **Date**: $RUN_DATE" >> "$OUTPUT_FILE"
        echo "- **Failed Job**: $JOB_NAME" >> "$OUTPUT_FILE"
        echo "- **Run URL**: $RUN_URL" >> "$OUTPUT_FILE"
        echo "- **Job Log URL**: $JOB_LOG_URL" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"

        # Add failure details if available
        for FAILURE_FILE in "$TEMP_DIR"/failure_${RUN_ID}_*.txt; do
            if [ -f "$FAILURE_FILE" ]; then
                echo "<details>" >> "$OUTPUT_FILE"
                echo "<summary>Failure Details</summary>" >> "$OUTPUT_FILE"
                echo "" >> "$OUTPUT_FILE"
                echo '```' >> "$OUTPUT_FILE"
                head -30 "$FAILURE_FILE" >> "$OUTPUT_FILE"
                echo '```' >> "$OUTPUT_FILE"
                echo "</details>" >> "$OUTPUT_FILE"
                echo "" >> "$OUTPUT_FILE"
            fi
        done
    done < "$TEMP_DIR/lightspeed_runs.txt"
fi

echo "" >> "$OUTPUT_FILE"
echo "### Other Failures (Not Related to Lightspeed Tests)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

if [ ! -s "$TEMP_DIR/other_runs.txt" ]; then
    echo "No other failures found." >> "$OUTPUT_FILE"
else
    while IFS='|' read -r RUN_ID RUN_TITLE RUN_BRANCH RUN_URL RUN_DATE FAILED_JOBS; do
        echo "- Run #$RUN_ID: **$RUN_TITLE** (\`$RUN_BRANCH\`) - Failed jobs: $FAILED_JOBS" >> "$OUTPUT_FILE"
        echo "  - URL: $RUN_URL" >> "$OUTPUT_FILE"
        echo "  - Date: $RUN_DATE" >> "$OUTPUT_FILE"
    done < "$TEMP_DIR/other_runs.txt"
fi

echo "" >> "$OUTPUT_FILE"
echo "## Final Summary" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "- **Total runs analyzed**: $TOTAL_RUNS" >> "$OUTPUT_FILE"
echo "- **Total failed runs**: $FAILED_RUNS" >> "$OUTPUT_FILE"
echo "- **Failures caused by Lightspeed tests**: $LIGHTSPEED_FAILURES" >> "$OUTPUT_FILE"
echo "- **Other failures**: $OTHER_FAILURES" >> "$OUTPUT_FILE"

if [ "$FAILED_RUNS" -gt 0 ]; then
    PERCENTAGE=$(awk "BEGIN {printf \"%.1f\", ($LIGHTSPEED_FAILURES / $FAILED_RUNS) * 100}")
    echo "- **Percentage of failures due to Lightspeed tests**: $PERCENTAGE%" >> "$OUTPUT_FILE"
fi

echo ""
echo "========================================="
echo "Report generated: $OUTPUT_FILE"
echo "========================================="
echo "Summary:"
echo "  Total runs: $TOTAL_RUNS"
echo "  Failed runs: $FAILED_RUNS"
echo "  Lightspeed test failures: $LIGHTSPEED_FAILURES ($([[ $FAILED_RUNS -gt 0 ]] && awk "BEGIN {printf \"%.1f\", ($LIGHTSPEED_FAILURES / $FAILED_RUNS) * 100}" || echo "0")%)"
echo "  Other failures: $OTHER_FAILURES ($([[ $FAILED_RUNS -gt 0 ]] && awk "BEGIN {printf \"%.1f\", ($OTHER_FAILURES / $FAILED_RUNS) * 100}" || echo "0")%)"
echo "========================================="
