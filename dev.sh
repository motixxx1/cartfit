#!/usr/bin/env bash
# Runs the API and the web app together.
set -euo pipefail
cd "$(dirname "$0")"

( cd backend && python -m uvicorn app.main:app --reload --port 8000 ) &
API=$!
( cd frontend && npm run dev ) &
WEB=$!

echo "API  → http://localhost:8000/docs"
echo "App  → http://localhost:3000"
trap 'kill $API $WEB 2>/dev/null' EXIT
wait
