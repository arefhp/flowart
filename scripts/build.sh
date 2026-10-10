#!/usr/bin/env sh
# Same as: npm run build
cd "$(dirname "$0")/.." && npm run build "$@"
