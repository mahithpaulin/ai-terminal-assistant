#!/bin/bash
set -e

pnpm install --frozen-lockfile
pnpm --filter db push

if [ -n "$GITHUB_TOKEN" ]; then
  GITHUB_REPO="mahithpaulin/ai-terminal-assistant"
  GITHUB_REMOTE_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git"

  git remote remove github 2>/dev/null || true
  git remote add github "$GITHUB_REMOTE_URL"

  git config user.email "replit-agent@replit.com"
  git config user.name "Replit Agent"

  git push github HEAD:main --force
  echo "Pushed to GitHub: ${GITHUB_REPO}"
else
  echo "GITHUB_TOKEN not set — skipping GitHub sync"
fi
