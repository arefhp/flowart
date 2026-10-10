#!/usr/bin/env sh
# Same as: node scripts/check-env.mjs
cd "$(dirname "$0")/.." && node scripts/check-env.mjs "$@"
