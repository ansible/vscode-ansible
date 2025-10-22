#!/bin/bash
# Test script for PR comment trigger functionality
# This script helps verify that the GitHub Actions workflows are properly configured

set -e

echo "🧪 Testing PR Comment Trigger Setup"
echo "=================================="

# Check if workflow files exist
echo "📁 Checking workflow files..."

if [ -f ".github/workflows/pr-comment-trigger.yml" ]; then
    echo "✅ pr-comment-trigger.yml exists"
else
    echo "❌ pr-comment-trigger.yml missing"
    exit 1
fi

if [ -f ".github/workflows/ci.yaml" ]; then
    echo "✅ ci.yaml exists"
else
    echo "❌ ci.yaml missing"
    exit 1
fi

# Check if ci.yaml has workflow_dispatch with test_type input
echo ""
echo "🔍 Checking ci.yaml configuration..."

if grep -q "workflow_dispatch:" .github/workflows/ci.yaml; then
    echo "✅ workflow_dispatch trigger found"
else
    echo "❌ workflow_dispatch trigger missing"
    exit 1
fi

if grep -q "test_type:" .github/workflows/ci.yaml; then
    echo "✅ test_type input parameter found"
else
    echo "❌ test_type input parameter missing"
    exit 1
fi

# Check if test conditions are properly configured
echo ""
echo "🔍 Checking test job conditions..."

if grep -q "github.event_name != 'workflow_dispatch' \|\| github.event.inputs.test_type" .github/workflows/ci.yaml; then
    echo "✅ Test job conditions properly configured"
else
    echo "❌ Test job conditions not properly configured"
    exit 1
fi

# Validate YAML syntax
echo ""
echo "🔍 Validating YAML syntax..."

if command -v yamllint >/dev/null 2>&1; then
    echo "Running yamllint..."
    yamllint .github/workflows/pr-comment-trigger.yml || echo "⚠️  yamllint warnings in pr-comment-trigger.yml"
    yamllint .github/workflows/ci.yaml || echo "⚠️  yamllint warnings in ci.yaml"
else
    echo "⚠️  yamllint not installed, skipping YAML validation"
fi

# Check if gh CLI is available
echo ""
echo "🔍 Checking GitHub CLI availability..."

if command -v gh >/dev/null 2>&1; then
    echo "✅ GitHub CLI (gh) is available"
    if gh auth status >/dev/null 2>&1; then
        echo "✅ GitHub CLI is authenticated"
    else
        echo "⚠️  GitHub CLI is not authenticated"
        echo "   Run 'gh auth login' to authenticate"
    fi
else
    echo "⚠️  GitHub CLI (gh) not installed"
    echo "   Install it from: https://cli.github.com/"
fi

echo ""
echo "🎉 Setup verification complete!"
echo ""
echo "📋 Next steps:"
echo "1. Commit and push these changes to your repository"
echo "2. Create a test pull request"
echo "3. Comment with '/test' to trigger the tests"
echo "4. Monitor the Actions tab to see the workflow run"
echo ""
echo "📖 For more information, see: docs/PR_COMMENT_TRIGGERS.md"
