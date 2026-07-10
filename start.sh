#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  npm install
fi

# Run backend in background
npm run dev:backend &
BACKEND_PID=$!

# Run frontend in background
npm run dev:frontend &
FRONTEND_PID=$!

# Trap signals to kill background processes on exit
trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; wait $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit' INT TERM EXIT

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID