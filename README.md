# AI KAPT

Локальный проект обучения ИИ для `дурака` с режимами `подкидной` и `переводной`.

## Требования

- **ОС:** Arch Linux (или другой дистрибутив Linux)
- **Node.js:** >= 18
- **npm:** >= 9

## Установка на Arch Linux

### Быстрая установка

```bash
chmod +x install-arch.sh
./install-arch.sh
```

Скрипт автоматически:
- Проверит ОС (Arch Linux)
- Установит `nodejs`, `npm`, `git` через `pacman`
- При наличии NVIDIA GPU — предложит установить `cuda` и `cudnn`
- Установит npm-зависимости и соберёт проект
- Предложит настроить systemd-сервис для автозапуска

### Ручная установка

```bash
sudo pacman -Syu
sudo pacman -S nodejs npm git

npm install
npm run build
```

## Запуск

### Через терминал

```bash
./start.sh
```

Откройте http://localhost:4100 в браузере.

Порт можно изменить через переменную окружения:

```bash
PORT=8080 ./start.sh
```

### Через systemd

```bash
# Запуск
systemctl start ai-kapt

# Остановка
systemctl stop ai-kapt

# Автозапуск при загрузке
systemctl enable ai-kapt

# Просмотр логов
journalctl -u ai-kapt -f
```

### Dev-режим (frontend + backend отдельно)

```bash
npm run dev:backend    # Backend на http://localhost:4100
npm run dev:frontend   # Frontend на http://localhost:5173 (проксирует API на backend)
```

## Структура проекта

```
.
├── backend/              # Node.js + TypeScript + Express + Socket.IO
│   ├── src/
│   │   ├── server.ts     # HTTP и WebSocket сервер
│   │   ├── engine.ts     # Игровой движок (логика дурака)
│   │   ├── model.ts      # Нейросеть (TensorFlow.js)
│   │   ├── training.ts   # Менеджер обучения
│   │   ├── store.ts      # Хранилище партий
│   │   └── types.ts      # Типы
│   ├── data/             # Сохранённые модели (создаётся автоматически)
│   └── dist/             # Скомпилированный JS
├── frontend/             # React + Vite + TypeScript
│   ├── src/
│   │   ├── App.tsx       # Главный компонент
│   │   ├── api.ts        # HTTP и WebSocket клиент
│   │   ├── main.tsx      # Точка входа
│   │   └── styles.css    # Стили
│   └── dist/             # Скомпилированный фронтенд
├── UI_KAPTI/             # Изображения карт (PNG)
├── install-arch.sh       # Скрипт установки для Arch Linux
├── ai-kapt.service.template  # Шаблон systemd-сервиса
└── start.sh              # Скрипт запуска
```

## Стек

- Backend: Node.js + TypeScript + Express + Socket.IO
- Frontend: React + Vite + TypeScript
- Обучение: TensorFlow.js

## GPU-ускорение (опционально)

Для ускорения обучения на Arch Linux с NVIDIA GPU:

```bash
sudo pacman -S cuda cudnn
```

TensorFlow.js автоматически использует GPU при наличии CUDA.
