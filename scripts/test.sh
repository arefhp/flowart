#!/usr/bin/env sh
# Same as: npm test
cd "$(dirname "$0")/.." && npm test "$@"
