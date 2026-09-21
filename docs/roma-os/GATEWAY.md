# Roma gateway — як телефон читає GBrain

Перший вертикальний зріз живих даних (21.09): Памʼять із GBrain, лише
читання, через один сервіс на Mac. Усе інше на екранах — поки демо, і
позначене як демо.

---

## 1. Архітектура

```
iPhone · PWA на GitHub Pages (статичний, без бекенда)
   │  HTTPS, лише всередині tailnet (приватна мережа Tailscale)
   ▼
Tailscale Serve на Mac  ──додає заголовок Tailscale-User-Login──▶  127.0.0.1:8787
                                                                     Roma gateway
                                                                     (server/roma-gateway)
                                                                        │ MCP, read-only token
                                                                        ▼
                                                                      GBrain (локально на Mac)
```

- **GBrain в інтернет не дивиться.** Він доступний тільки gateway на тому ж Mac.
- **Hermes фронтенду не віддаємо.** `POST /api/v1/crow` існує як шов і відповідає
  `501`, поки Hermes не підключений окремим рішенням.
- **Gateway слухає лише `127.0.0.1`.** Єдиний шлях до нього — Tailscale Serve.
- **У застосунку немає жодного ключа.** Телефон знає лише адресу gateway
  (hostname, не секрет) і вибір «Демо / Наживо».

## 2. Межа безпеки

| Що | Де живе | Де НЕ живе |
|---|---|---|
| Token GBrain (окремий, scope `read`) | `server/roma-gateway/.env` на Mac | фронтенд, bundle, localStorage, git |
| Allowlist логінів Tailscale | `.env` (`ROMA_ALLOWED_LOGINS`) | репозиторій |
| Дозволені origin'и PWA | `.env` (`ROMA_ALLOWED_ORIGINS`), точні, не `*` | — |
| Адреса gateway | localStorage `roma_gateway_url` | — |

Ідентичність — це заголовок `Tailscale-User-Login`, який Serve додає до
кожного запиту зсередини tailnet. Без заголовка або з чужим логіном — `403`.
Порожній allowlist = нікого не пускати (fail closed).

Gateway використовує **один** інструмент GBrain — `recall` без `query`, з
`limit` — і жодних записів: ні `remember`, ні `forget`, ні `put_page`,
ні `synthesize`.

## 3. Endpoint'и (адреси) gateway

| Метод, шлях | Ідентичність | Відповідь |
|---|---|---|
| `GET /api/v1/health` | не потрібна | `{ ok, version }` — без даних |
| `GET /api/v1/state` | потрібна | `{ memory: MemoryFact[], fetchedAt, source: "gbrain:recall", dropped }` |
| `POST /api/v1/crow` | потрібна | `501 not_implemented` — шов для Hermes |
| `OPTIONS *` | — | preflight (попередній запит браузера) для дозволеного origin |

У `/state` є **лише** те, що справді живе. `agents`, `projects`, `blockers`,
`events`, `attention` відсутні навмисно — застосунок бере їх із демо і
позначає «демо».

## 4. Мапа GBrain → Памʼять

Перевірено на встановленому GBrain 0.51 (21.09): `recall` без `query`
повертає `facts[]` найновіші першими, лише активні (`include_expired`
за замовчуванням `false`), `limit` до 100.

| Поле факту GBrain | Поле `MemoryFact` | Правило |
|---|---|---|
| `fact_id` (або `id`) | `id` | стабільний id GBrain, рядком; ніколи не генерується |
| `fact` | `text` | як є |
| `kind`, `entity_slug` | `category` | `preference` → `preference`; `people/*` → `person`; `projects/*` → `project`; решта → `system` |
| `valid_from`, інакше `created_at` | `ts` | час події, інакше час запису |
| `created_at` | `created_at`, `updated_at` | факт незмінний — одна дата |
| — | `deleted_at`, `user_id`, `hlc` | `null`: технічні поля Roma OS, GBrain їх не має |

Рядки без `fact_id`/`id`, без тексту або без валідного `created_at`
відкидаються і рахуються в `dropped`. Слаги у встановленому brain — без
префіксів (`roman-ai-os`), тож сьогодні такі факти потрапляють у `system`;
правило застосоване буквально, без здогадок.

## 5. Що зберігає телефон

- `roma_data_source` — `demo | live`
- `roma_gateway_url` — адреса gateway
- `roma_live_snapshot` — **лише** нормалізований знімок: `MemoryFact[]`,
  `fetchedAt`, `source`; один, останній; замінюється при кожному успіху;
  видаляється при перемиканні на «Демо»

Не зберігається: сирі відповіді GBrain, сторінки, транскрипти, ключі,
будь-що, чого UI не показує.

## 6. Коли Mac спить або недосяжний

Оновлення не відбувається, Crow (пізніше) недоступний. Памʼять показує
останній знімок із міткою «наживо» і рядком **«Оновлено N хв тому · Mac
недоступний»**. На демо застосунок мовчки не переходить. Причини словами:

| Помилка | Текст |
|---|---|
| адреса не задана | адресу gateway не задано |
| телефон офлайн | немає мережі |
| DNS/VPN/Mac/`5xx` | Mac недоступний |
| `401`/`403` | немає доступу |
| `429` | забагато запитів |
| не JSON або чужа форма | відповідь gateway не розпізнана |

Оновлення: при старті, при `pageshow`, при поверненні застосунку у
видимість, і кожні 90 с, поки він видимий. Фонового опитування немає.

## 7. Як запустити gateway на Mac

1. У корені репо: `npm ci` (workspace встановить залежності gateway).
2. `cp server/roma-gateway/.env.example server/roma-gateway/.env` і заповнити:
   `ROMA_ALLOWED_LOGINS` (твій логін Tailscale), `GBRAIN_MCP_URL`
   (адреса MCP GBrain, як її бачить Mac), `GBRAIN_TOKEN` (див. §8).
3. `npm run start --workspace server/roma-gateway`
4. Перевірка: `curl http://127.0.0.1:8787/api/v1/health` → `{"ok":true,…}`.
5. Перевірка з ідентичністю: `curl -H 'Tailscale-User-Login: <твій логін>' http://127.0.0.1:8787/api/v1/state`.

Локально: `npm run verify --workspace server/roma-gateway` — lint, типи, 21 тест.

## 8. Credential GBrain — один крок для Романа

Створити в GBrain **окремого клієнта** для gateway зі scope лише `read`
(не перевикористовувати токени Hermes, Claude Desktop чи Claude Code) і
вставити його token у `.env` як `GBRAIN_TOKEN`. Команда — з `gbrain auth --help`
на Mac (сімейство `gbrain auth …`; точний підкоманд перевірити там, тут не
вигадуємо). Gateway цей токен нікуди не передає, крім самого GBrain.

## 9. Tailscale Serve — після перевірки на Mac

Команду сюди записуємо **лише** після перевірки фактичної версії:

1. `tailscale version` (у macOS-застосунку CLI лежить у
   `/Applications/Tailscale.app/Contents/MacOS/Tailscale`).
2. `tailscale serve --help` — синтаксис саме цієї версії.
3. В адмінці tailnet мають бути увімкнені MagicDNS і HTTPS-сертифікати —
   інакше `https://<mac>.<tailnet>.ts.net` не підніметься.
4. Після цього — опублікувати `127.0.0.1:8787` через Serve (не Funnel: Funnel
   виставляє назовні і не додає заголовок ідентичності).
5. У Roma OS: Налаштування → Джерело даних → **Наживо** → адреса
   `https://<mac>.<tailnet>.ts.net`.

## 10. Приймання на телефоні

1. Джерело даних = Наживо, адреса задана.
2. Памʼять показує факти GBrain, мітка «наживо», джерело `gbrain:recall`.
3. Control, Агенти, Проєкти, Події — з міткою «демо».
4. Вимкнути Tailscale або приспати Mac → факти лишаються, «Оновлено N хв
   тому · Mac недоступний».
5. Повернути «Демо» → знімок зник із телефона, Памʼять знову локальна.

## 11. Далі (не в цьому зрізі)

Проєкти/Блокери з канонічного стану; «Потребує мене» як похідне; Події з
`timeline`; Агенти лише з того, що видно; Crow через Hermes — після
окремого рішення про API Hermes; запис у GBrain з телефона — останнім.
