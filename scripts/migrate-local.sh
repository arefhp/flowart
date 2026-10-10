#!/usr/bin/env sh
# Same as: npm run migrate:local
cd "$(dirname "$0")/.." && npm run migrate:local "$@"
