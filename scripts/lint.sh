#!/usr/bin/env sh
# Same as: npm run lint
cd "$(dirname "$0")/.." && npm run lint "$@"
