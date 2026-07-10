#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node &>/dev/null; then
  echo "Ошибка: Node.js не установлен."
  echo "На Arch Linux: sudo pacman -S nodejs npm"
  echo "Или запустите: ./install-arch.sh"
  exit 1
fi

if ! command -v npm &>/dev/null; then
  echo "Ошибка: npm не установлен."
  echo "На Arch Linux: sudo pacman -S npm"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Установка зависимостей..."
  npm install
fi

if [ ! -d "backend/dist" ] || [ ! -d "frontend/dist" ]; then
  echo "Сборка проекта..."
  npm run build
fi

PORT="${PORT:-4100}"
export PORT

echo "Запуск AI KAPT на порту ${PORT}..."
echo "Откройте http://localhost:${PORT} в браузере"
echo "Нажмите Ctrl+C для остановки"
echo ""

npm run dev:backend &
BACKEND_PID=$!

npm run dev:frontend &
FRONTEND_PID=$!

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; wait $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit' INT TERM EXIT

wait $BACKEND_PID $FRONTEND_PID
