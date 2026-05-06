#!/bin/bash
set -e

if [ -z "$GITHUB_TOKEN" ]; then
  echo "GITHUB_TOKEN not set — skipping GitHub sync"
  exit 0
fi

GITHUB_REPO="mahithpaulin/ai-terminal-assistant"
GITHUB_REMOTE_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git"

trap 'git remote remove github 2>/dev/null || true' EXIT

git remote remove github 2>/dev/null || true
git remote add github "$GITHUB_REMOTE_URL"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "Not on main branch (currently on '$CURRENT_BRANCH') — skipping GitHub sync"
  exit 0
fi

git fetch github main 2>/dev/null || true

git -c user.email="replit-agent@replit.com" \
    -c user.name="Replit Agent" \
    push github main:main --force-with-lease=main
echo "Synced to GitHub: ${GITHUB_REPO}"
