# Roman AI OS — Control Panel

Human-facing operational interface (інтерфейс для людини) до **Roman AI OS**, зроблений як
PWA (Progressive Web App — вебзастосунок, який встановлюється як програма) з прицілом
насамперед на iPhone.

**▶ Відкрити застосунок: <https://owls68.github.io/Control-Panel-OS/>**
([як він деплоїться](#6-deploy-github-pages))

> **Панель не є джерелом правди.** Вона лише показує стан, який живе в інших системах.

---

## 1. Що це і що це НЕ

Control Panel — це шар відображення. Він потрібен, щоб Роман бачив стан системи за кілька
секунд, не читаючи вручну десяток файлів.

Панель **не є**:

- окремим Second Brain;
- новою базою памʼяті;
- новим source of truth;
- Manager / Router;
- multi-agent системою;
- заміною GBrain або PROJECT / STATE / LESSONS.

## 2. Де живе правда

| Тип даних | Source of truth |
| --- | --- |
| Довготривале знання, факти, рішення | **GBrain** |
| Поточний стан проєкту (savegame) | **STATE.md** |
| Стабільний контекст і архітектура проєкту | **PROJECT.md** |
| Уроки й патерни | **LESSONS.md** |
| Код, branch, commit | **GitHub** |
| Документи | **Google Drive** |
| Пошта / календар | **Gmail / Calendar** |
| Ця панель | **ніколи не канон** |

Правило зі старої системи лишається чинним: **cache is not answer** — зведення й кеші є
лише покажчиками, актуальну цифру треба брати з канонічного джерела.

Тому кожна секція UI показує два бейджі: **origin** (`MOCK` / `LIVE`) і **source of truth**
(GBrain, STATE.md, GitHub, локальний runtime тощо).

**Канонічні документи Roman AI OS лежать у Google Drive, у папці «Roman AI OS — GBrain».**
У цьому repo їхніх копій немає — і не повинно бути, щоб не зʼявилося друге джерело правди.

## 3. Архітектура

```text
  screens/            ← екрани; не знають нічого про GBrain, Hermes чи GitHub
      ↓ (читають лише інтерфейси)
  adapters/types.ts   ← контракт: ProjectsAdapter, GBrainAdapter, AgentsAdapter, …
      ↓
  adapters/mock/      ← сьогодні: фікстури зі snapshot canonical документів
  adapters/<real>/    ← завтра: thin gateway → GBrain / GitHub / Drive / Hermes
```

Кожен виклик adapter повертає `Sourced<T>`:

```ts
{ data, origin: 'mock' | 'live', sourceOfTruth, retrievedAt, staleReason? }
```

Саме тому UI завжди може чесно підписати дані, не знаючи, який backend під ним.

**Ключове обмеження:** жоден компонент не імпортує adapter напряму — усі беруть його з
React context через `useAdapters()`. Заміна mock на реальну реалізацію не потребує
переписування UI.

### Структура проєкту

```text
src/
├── domain/types.ts        # мінімальні frontend-типи (ProjectSummary, MemoryItem, …)
├── adapters/
│   ├── types.ts           # інтерфейси адаптерів — єдиний контракт для UI
│   ├── index.ts           # вибір реалізації за VITE_DATA_SOURCE
│   └── mock/
│       ├── fixtures.ts    # ВСІ демо-дані, в одному місці
│       └── index.ts       # mock-реалізації адаптерів
├── screens/               # Dashboard, Projects, ProjectDetail, Memory, Agents, Activity, Settings
├── ui/
│   ├── components/        # AppShell, Badges, States, DataNotice, Icons
│   ├── hooks/             # useAdapters, useSourced, useTheme
│   └── format.ts          # дати та відносний час (uk-UA)
└── styles/
    ├── tokens.css         # design tokens + світла/темна теми
    └── global.css         # скидання, layout, примітиви
```

## 4. Stack і чому саме він

**React + Vite + TypeScript + react-router + vite-plugin-pwa**, звичайний CSS з design
tokens. Без UI-фреймворку, без state-бібліотеки, без CSS-in-JS.

- **TypeScript** — domain types і adapter-контракти мають бути перевірені компілятором;
  без цього «легка заміна mock на real» лишається обіцянкою, а не властивістю.
- **Vite + vite-plugin-pwa** — manifest і service worker генеруються з одного конфіга,
  а не підтримуються вручну.
- **react-router** — шість розділів плюс detail view; писати власний роутер немає причини.
- **Звичайний CSS** — теми, safe areas й touch targets роблять custom properties; Tailwind
  чи CSS-in-JS додали б залежність і конфіг без виграшу на цьому обсязі.
- **Vitest + Playwright** — швидкі unit/компонентні тести плюс реальна перевірка PWA та
  двох viewport-ів на зібраному застосунку.

Детальніше — у [`docs/DECISIONS.md`](docs/DECISIONS.md).

## 5. Локальна розробка

```bash
npm install
npm run dev          # http://localhost:5173

npm run lint         # ESLint
npm run typecheck    # tsc
npm run test         # Vitest (unit + компонентні)
npm run build        # tsc + vite build → dist/
npm run preview      # віддає production build на :4173
npm run e2e          # Playwright: iPhone + desktop, проти production build
npm run verify       # lint + test + build
```

Іконки PWA перегенеровуються з `scripts/generate-icons.mjs` (рендерить SVG через
Chromium, який уже є в Playwright — окремий image-пакет не потрібен).

## 6. Deploy (GitHub Pages)

Застосунок публікується на GitHub Pages через
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) — статичний PWA, без
backend і без секретів.

**URL:** <https://owls68.github.io/Control-Panel-OS/>

Два моменти, від яких залежить робочий sub-path deploy:

- **`DEPLOY_BASE` має бути абсолютним** (`/Control-Panel-OS/`). Router бере `basename`
  з `BASE_URL`, і відносний base (`./`) нормалізується у `/./`, який не матчить жодного
  URL — застосунок просто не рендериться. Workflow бере base з
  `actions/configure-pages`, тому шлях не захардкоджений.
- **`404.html`** — копія `index.html`, яку генерує build. GitHub Pages не має SPA
  fallback, тому без неї refresh на `/projects` дав би 404. Разом із нею Pages віддає
  `404.html`, застосунок стартує, читає URL і показує правильний екран.

Локально відтворити production-збірку:

```bash
npm run build:pages          # DEPLOY_BASE=/Control-Panel-OS/
SMOKE_URL=https://owls68.github.io/Control-Panel-OS/ npm run smoke:deploy
```

`smoke:deploy` перевіряє саме те, що ламається тільки на реальному деплої: base path,
client-side routing, refresh на deep link, scope service worker і доступність усіх іконок
manifest — на мобільному й desktop viewport.

## 7. Що зараз реально працює

- Встановлюваний PWA: manifest, service worker, standalone, offline-кеш, prompt на оновлення.
- Навігація між шістьма розділами + project detail view; bottom tab bar на мобільному,
  sidebar на desktop.
- Усі екрани працюють через adapter layer; стани loading / error / empty реалізовані.
- Пошук у памʼяті, фільтри подій.
- Світла й темна теми (системна або закріплена вручну).
- iPhone safe areas, touch targets ≥ 44px, відсутність горизонтального скролу.

## 8. Що зараз mock

**Усе.** Жоден реальний сервіс не опитується.

Дані у `src/adapters/mock/fixtures.ts` — це snapshot, переписаний вручну з canonical
документів Roman AI OS станом на **19 вересня 2026**: версія GBrain, стан Hermes,
мігровані факти, backup, блокери, «чекає на Романа». Він реалістичний, щоб UI можна було
оцінювати, але це не живі дані — і панель це явно показує.

Коли зʼявиться реальний adapter, ці фікстури лишаються як набір даних для тестів.

## 9. Security

- У frontend немає секретів: ні API-ключів, ні токенів, ні bearer credentials.
- У `localStorage` зберігається **лише обрана тема** — більше нічого.
- GBrain не відкривається в інтернет напряму. Реальні дані підуть через thin gateway
  (тонкий серверний шар), який тримає credentials і scopes.
- `.env.example` не містить справжніх значень. Будь-яка змінна з префіксом `VITE_`
  потрапляє у клієнтський bundle і є **публічною** — секрети туди класти не можна.
- Панель у поточному вигляді лише читає; дій рівня L2/L3 вона не виконує.

## 10. Що потрібно для реальних integrations

Наступний крок — **thin gateway**, бо frontend не має тримати credentials. Далі, за
пріоритетом:

| Інтеграція | Що потрібно |
| --- | --- |
| **GBrain** | HTTP-доступ через gateway + окремий read-only scope для панелі (не спільний Bearer з Hermes). Достатньо verbs `recall`, `entity`, `delta`. |
| **PROJECT / STATE / LESSONS** | Узгоджений machine-readable формат або парсер STATE.md + project registry з `project_id`. |
| **Hermes** | Health/status endpoint: стан контейнера, provider/model, остання активність. |
| **Claude / GPT** | Реєстр клієнтів із їхніми scopes і останньою активністю. |
| **GitHub** | Read-only через gateway: branch, останній commit, стан CI. |
| **Google Drive** | Read-only метадані canonical документів (назва, час зміни, посилання). |
| **Backups** | Час останнього backup, результат перевірки restore, наявність off-device копії. |

## 11. Межі

Свідомо **не** побудовано: Manager, Router, ієрархія агентів, departments, Telegram,
task scheduler, cron, vector DB, повноцінний backend, складний RBAC, власна auth.
Для них лишені точки розширення, але не реалізації.

Правило перед додаванням компонента: *яку конкретну проблему він вирішує зараз* і *що
реально стане гірше без нього*. Якщо відповідь — «можливо знадобиться колись», не будуємо.
