# Преферанс онлайн

Онлайн-реализация классической русской карточной игры **преферанс** — построена на [SvelteKit](https://kit.svelte.dev), развёртывается на [Cloudflare Pages](https://pages.cloudflare.com) с игровым движком на [Cloudflare Workers](https://workers.cloudflare.com) и базой данных [Cloudflare D1](https://developers.cloudflare.com/d1/).

## Стек технологий

| Слой | Технология |
|---|---|
| Frontend | SvelteKit 2 + Svelte 5 (runes mode) |
| Хостинг | Cloudflare Pages |
| WebSocket (игровые комнаты) | Cloudflare Durable Objects |
| Игровой движок | Cloudflare Workers |
| База данных | Cloudflare D1 (SQLite) |
| Аутентификация | Google OAuth 2.0 |

## Структура проекта

```
preferans/
├── src/                          # SvelteKit приложение
│   ├── routes/
│   │   ├── +layout.svelte        # Общий layout с навигацией
│   │   ├── +layout.server.ts     # Загрузка сессии пользователя
│   │   ├── +page.svelte          # Лобби (список игр)
│   │   ├── +page.server.ts       # Загрузка игр из D1
│   │   ├── auth/
│   │   │   ├── login/            # Страница входа + OAuth redirect
│   │   │   ├── callback/         # Google OAuth callback
│   │   │   └── logout/           # Выход из системы
│   │   └── game/[id]/            # Игровая комната
│   ├── lib/
│   │   ├── components/           # UI компоненты (Card, Hand, Table, …)
│   │   ├── stores/               # Svelte stores (auth, game WebSocket)
│   │   └── types/                # TypeScript типы (карты, контракты, …)
│   ├── app.html                  # HTML шаблон
│   ├── app.d.ts                  # Типы для App namespace
│   └── hooks.server.ts           # Middleware: валидация сессий
├── worker/                       # Cloudflare Worker (игровой движок)
│   ├── src/
│   │   ├── index.ts              # Точка входа, REST API
│   │   ├── gameEngine.ts         # Правила преферанса
│   │   └── durable-objects/
│   │       └── GameRoom.ts       # WebSocket + состояние игры
│   └── wrangler.toml
├── migrations/
│   └── 0001_initial.sql          # Схема D1 базы данных
├── svelte.config.js
├── vite.config.ts
└── wrangler.toml                 # Конфигурация Cloudflare Pages
```

## Быстрый старт (локальная разработка)

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка переменных окружения

Создайте файл `.dev.vars` в корне проекта:

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
SESSION_SECRET=a_random_secret_at_least_32_chars
```

### 3. Создание D1 базы данных

```bash
# Создать базу данных
npx wrangler d1 create preferans-db
# Команда выведет строку вида:
#   database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
# Замените YOUR_D1_DATABASE_ID на это значение в файлах:
#   wrangler.toml (строка [[d1_databases]])
#   worker/wrangler.toml (строка [[d1_databases]])

# Применить миграции локально
npm run db:migrate:local
```

### 4. Запуск Worker локально

```bash
npm run worker:dev
```

### 5. Запуск SvelteKit frontend

```bash
npm run dev
```

Откройте http://localhost:5173

## Деплой на Cloudflare

### Frontend (Pages)

```bash
npm run build
# Подключите репозиторий в Cloudflare Pages
# Build command: npm run build
# Build output: .svelte-kit/cloudflare
```

### Worker

```bash
# Установить секреты
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET

# Деплой
npm run worker:deploy
```

### D1 миграции (production)

```bash
npm run db:migrate
```

## Правила преферанса

- **Колода**: 32 карты (от 7 до туза)
- **Игроки**: ровно 3
- **Раздача**: по 10 карт каждому + 2 карты в прикуп
- **Торговля**: игроки объявляют контракты по возрастанию
- **Контракты**: 6-10 взяток в масти, без козыря, мизер, гранд
- **Прикуп**: победитель торговли берёт прикуп и делает сброс
- **Игра**: берутся взятки, объявляется козырь
- **Счёт**: по результатам контракта

## Разработка

```bash
npm run check       # TypeScript проверка
npm run lint        # ESLint + Prettier
npm run format      # Форматирование кода
```
