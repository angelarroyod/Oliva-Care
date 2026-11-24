#!/usr/bin/env bash
# Usage: scripts/migration-info.sh            -> next migration number
#        scripts/migration-info.sh <file.sql> -> LF-normalized sha256 (matches Monaco getValue(1))
set -euo pipefail
dir="${MIGRATIONS_DIR:-supabase/migrations}"
if [ $# -eq 0 ]; then
  last=$(ls "$dir" | grep -oE '^[0-9]{4}' | sort | tail -1)
  printf '%04d\n' $((10#${last:-0} + 1))
else
  tr -d '\r' < "$1" | sha256sum | cut -d' ' -f1
fi
