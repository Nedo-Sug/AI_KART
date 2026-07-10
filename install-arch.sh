#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

check_os() {
  if [ ! -f /etc/arch-release ]; then
    echo "Этот скрипт предназначен для Arch Linux."
    echo "Обнаружена другая ОС. Продолжение не рекомендуется."
    read -rp "Продолжить? [y/N] " answer
    case "$answer" in
      [yY][eE][sS]|[yY]) ;;
      *) exit 1 ;;
    esac
  fi
}

check_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    echo "Не запускайте этот скрипт от root. Используйте обычного пользователя с sudo."
    exit 1
  fi
  if ! sudo -v &>/dev/null; then
    echo "sudo недоступен. Установите sudo и добавьте пользователя в группу wheel."
    exit 1
  fi
}

install_packages() {
  echo "=== Обновление пакетной базы ==="
  sudo pacman -Syu --noconfirm

  echo "=== Установка Node.js и npm ==="
  if ! command -v node &>/dev/null; then
    sudo pacman -S --noconfirm nodejs npm
  else
    echo "Node.js $(node -v) уже установлен."
  fi

  echo "=== Установка git ==="
  if ! command -v git &>/dev/null; then
    sudo pacman -S --noconfirm git
  else
    echo "git уже установлен."
  fi

  echo "=== Опциональные пакеты для TensorFlow.js (ускорение) ==="
  local has_cuda=false
  if command -v nvidia-smi &>/dev/null; then
    has_cuda=true
    echo "Обнаружен NVIDIA GPU. Установка CUDA Toolkit..."
    if ! pacman -Q cuda &>/dev/null 2>&1; then
      sudo pacman -S --noconfirm cuda cudnn
    else
      echo "CUDA уже установлен."
    fi
  else
    echo "NVIDIA GPU не обнаружен. TensorFlow.js будет работать на CPU."
  fi
}

setup_project() {
  echo "=== Очистка старых зависимостей (Windows-совместимых) ==="
  cd "$REPO_DIR"
  if [ -d "node_modules" ] || [ -f "package-lock.json" ]; then
    echo "Удаление node_modules и package-lock.json для переустановки под Linux..."
    rm -rf node_modules package-lock.json
  fi

  echo "=== Установка зависимостей проекта ==="
  npm install

  echo "=== Сборка backend и frontend ==="
  npm run build

  echo "=== Создание директории для данных ==="
  mkdir -p "$REPO_DIR/backend/data"
}

setup_systemd() {
  local service_path="/etc/systemd/system/ai-kapt.service"
  echo "=== Настройка systemd сервиса ==="
  read -rp "Установить systemd сервис для автозапуска? [y/N] " answer
  case "$answer" in
    [yY][eE][sS]|[yY])
      sudo sed "s|__REPO_DIR__|$REPO_DIR|g; s|__USER__|$(whoami)|g" \
        "$REPO_DIR/ai-kapt.service.template" > "$service_path"
      sudo systemctl daemon-reload
      sudo systemctl enable ai-kapt.service
      echo "Сервис ai-kapt установлен и включён в автозапуск."
      echo "Управление: systemctl start/stop/restart ai-kapt"
      echo "Логи: journalctl -u ai-kapt -f"
      ;;
    *)
      echo "Системный сервис не установлен. Запускайте через start.sh"
      ;;
  esac
}

main() {
  check_os
  check_sudo
  install_packages
  setup_project
  setup_systemd

  echo ""
  echo "=== Установка завершена ==="
  echo "Запуск проекта:"
  echo "  ./start.sh          — запуск в терминале"
  echo "  systemctl start ai-kapt  — запуск через systemd"
  echo "  Откройте http://localhost:4100 в браузере"
}

main "$@"
