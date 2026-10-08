#!/usr/bin/env bash
# Runs a sim script from a snapshot of the code as it is now, so edits made while a long batch runs don't leak into
# it halfway through. Usage: sim/snap.sh <name> <script> [args...]      e.g. sim/snap.sh a sim/brutal.sh 80 hard brutal
cd "$(dirname "$0")/.."
NAME=$1; shift
SNAP=${TMPDIR:-/tmp}/strat-snap-$NAME
rm -rf "$SNAP" && mkdir -p "$SNAP"
cp -R src sim package.json tsconfig.json "$SNAP"/
ln -s "$PWD/node_modules" "$SNAP/node_modules"
cd "$SNAP" && "$@"
