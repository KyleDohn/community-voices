#!/usr/bin/env bash
# Usage: mutate.sh <source-file> "<test command>" '<sed expr>' ['<sed expr>' ...]
# Applies each sed mutant to a pristine copy, runs the tests, prints the verdict, and always restores.
set -uo pipefail
file=$1; tests=$2; shift 2
backup=$(mktemp); cp "$file" "$backup"
trap 'cp "$backup" "$file"; rm -f "$backup"' EXIT
for expr in "$@"; do
  cp "$backup" "$file"
  sed -i '' "$expr" "$file"
  if cmp -s "$file" "$backup"; then echo "NOT APPLIED  $expr"; continue; fi
  if bash -c "$tests" >/dev/null 2>&1; then echo "SURVIVED     $expr"; else echo "killed       $expr"; fi
done
