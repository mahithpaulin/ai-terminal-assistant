#!/bin/bash
set -e

pnpm install --frozen-lockfile
pnpm --filter db push

HOOK_TARGET=".git/hooks/post-commit"
HOOK_SCRIPT='#!/bin/bash
SCRIPT_DIR="$(git rev-parse --show-toplevel)/scripts"
if [ -f "$SCRIPT_DIR/sync-to-github.sh" ]; then
  bash "$SCRIPT_DIR/sync-to-github.sh" || true
fi'

echo "$HOOK_SCRIPT" > "$HOOK_TARGET"
chmod +x "$HOOK_TARGET"
echo "Installed post-commit hook at $HOOK_TARGET"

bash scripts/sync-to-github.sh
