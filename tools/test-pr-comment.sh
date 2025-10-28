#!/bin/bash
# Test script to verify PR comment trigger functionality

echo "🧪 Testing PR Comment Trigger"
echo "============================="

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Not in a git repository"
    exit 1
fi

# Check if we're on a branch (not main)
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    echo "⚠️  You're on the main branch. Consider creating a feature branch for testing."
fi

echo "Current branch: $CURRENT_BRANCH"

# Check if there are uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 You have uncommitted changes. Committing them..."
    git add .
    git commit -m "Add PR comment trigger functionality

- Add pr-comment-trigger.yml workflow
- Update ci.yaml to support workflow_dispatch with test types
- Add support for triggering tests via PR comments
- Support commands: /test, /test-unit, /test-ui, /test-e2e, /test-als
- Also support: run all tests, run tests, etc."
fi

# Check if there's a remote
if ! git remote get-url origin >/dev/null 2>&1; then
    echo "❌ No remote origin found. Please add a remote repository."
    exit 1
fi

echo "Remote origin: $(git remote get-url origin)"

# Push the changes
echo "🚀 Pushing changes..."
git push origin "$CURRENT_BRANCH"

echo ""
echo "✅ Changes pushed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Create a Pull Request on GitHub"
echo "2. Comment on the PR with one of these commands:"
echo "   - '/test' or 'run all tests'"
echo "   - '/test-unit'"
echo "   - '/test-ui'"
echo "   - '/test-e2e'"
echo "   - '/test-als'"
echo "3. Check the Actions tab to see if the workflow runs"
echo "4. The bot should respond to your comment with status updates"
echo ""
echo "🔍 Troubleshooting:"
echo "- If nothing happens, check the Actions tab for failed workflows"
echo "- Look for 'PR Comment Trigger Tests' workflow runs"
echo "- Check the workflow logs for error messages"
