#!/bin/bash
# Debug script to check PR comment trigger workflow runs

echo "🔍 Checking PR Comment Trigger Workflow Status"
echo "=============================================="
echo ""

# Check if gh is available
if ! command -v gh >/dev/null 2>&1; then
    echo "❌ GitHub CLI not installed. Install from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status >/dev/null 2>&1; then
    echo "❌ Please authenticate: gh auth login"
    exit 1
fi

echo "📊 Recent 'PR Comment Trigger Tests' workflow runs:"
echo "---------------------------------------------------"
gh run list --workflow="PR Comment Trigger Tests" --limit 10 2>/dev/null || echo "No runs found or workflow not recognized"

echo ""
echo "📊 Recent 'ci' workflow runs:"
echo "-----------------------------"
gh run list --workflow="ci" --limit 5

echo ""
echo "📊 All recent workflow runs:"
echo "----------------------------"
gh run list --limit 10

echo ""
echo "💡 Tips:"
echo "- If 'PR Comment Trigger Tests' shows runs, check their status"
echo "- Click on a run to see detailed logs"
echo "- Look for any failures in the check-comment or trigger-tests jobs"
echo ""
echo "To view details of the latest run:"
echo "  gh run view --log"
echo ""
echo "To view in browser:"
echo "  gh run view --web"
