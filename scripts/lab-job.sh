#!/bin/sh
# Runs a script that drives the lab (banners.mjs, smoke.mjs, shots.mjs) on a
# fleet node: brings up the lab dev server, runs the script, stops the server.
#
#   sh scripts/lab-job.sh scripts/banners.mjs [args]
set -e
. "$HOME/.nvm/nvm.sh"
nvm use >/dev/null
npm run build -w agnew >/dev/null
npm run dev -w @agnew/lab >/dev/null 2>&1 &
dev=$!
trap 'pkill -P $dev 2>/dev/null; kill $dev 2>/dev/null' EXIT
until curl -s -o /dev/null http://localhost:5190/; do sleep 0.5; done
node "$@"
