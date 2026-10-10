#!/usr/bin/env sh
# Same as: npm run typecheck
cd "$(dirname "$0")/.." && npm run typecheck "$@"
