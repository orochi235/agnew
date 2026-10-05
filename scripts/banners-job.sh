#!/bin/sh
# Renders the title-bar banners headless on a fleet node: brings up the lab
# dev server, runs scripts/banners.mjs against it, and stops the server.
set -e
. "$HOME/.nvm/nvm.sh"
nvm use >/dev/null
npm run build -w agnew >/dev/null
npm run dev -w @agnew/lab >/dev/null 2>&1 &
dev=$!
trap 'pkill -P $dev 2>/dev/null; kill $dev 2>/dev/null' EXIT
until curl -s -o /dev/null http://localhost:5190/; do sleep 0.5; done
node scripts/banners.mjs "$@"
