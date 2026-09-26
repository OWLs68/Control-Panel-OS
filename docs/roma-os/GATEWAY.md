# Roma gateway (`server/roma-gateway`) — як Crow OS MP читає GBrain і говорить з Hermes

Два вертикальні зрізи живих даних через один сервіс на Mac:

- **зріз 1 (21.09):** Памʼять із GBrain, лише читання;
- **зріз 2 (21.09, сесія dmm98t):** Crow через Hermes — одна чиста відповідь
  на кожне повідомлення.

Усе інше на екранах — поки демо, і позначене як демо.

---

## 1. Архітектура

```
iPhone · PWA на GitHub Pages (статичний, без бекенда)
   │  HTTPS, лише всередині tailnet (приватна мережа Tailscale)
   ▼
Tailscale Serve на Mac  ──додає заголовок Tailscale-User-Login──▶  127.0.0.1:8787
                                                                     Roma gateway
                                                                     (server/roma-gateway)
                                                       ┌───────────────────┴───────────────────┐
                                                       │ MCP, read-only token                  │ WebSocket JSON-RPC, ?token= з файлу
                                                       ▼                                       ▼
                                                 GBrain (локально)                Hermes server mode, 127.0.0.1:9119/api/ws
                                                                                       │
                                                                                       ▼
                                                                          DeepSeek → mcp__gbrain__recall → відповідь
```

- **GBrain з боку gateway — лише локально.** Gateway читає його на тому ж Mac.
  Публікація GBrain через ngrok — окремий дозволений транспорт для інших
  клієнтів (правило — `CLAUDE.md`, «Правила»), не шлях телефону.
- **Hermes теж loopback-only.** Єдиний його клієнт — gateway. Телефон не
  знає ні адреси Hermes, ні токена; він знає лише адресу gateway.
- **Gateway слухає лише `127.0.0.1`.** Єдиний шлях до нього — Tailscale Serve.
- **У застосунку немає жодного ключа.** Телефон знає адресу gateway (hostname,
  не секрет) і вибір «Демо / Наживо». Обидва живі шляхи — Памʼять і Crow —
  вмикаються одним перемикачем разом; мовчазного переходу на демо немає.

**Реальний контур на Mac (за словами Романа 21–22.09; команди LaunchAgent і
Docker у репо не зберігаються).** GBrain, ngrok і Roma gateway — macOS
LaunchAgents; Hermes — Docker-контейнер з `restart unless-stopped`, Docker —
у «Відкривати під час входу». ngrok публікує **лише GBrain** (публічний URL →
`localhost:3131`; `4040` — локальний inspection port ngrok) і **не є шляхом
телефону до gateway**: телефон → gateway лише через Tailscale Serve із
заголовком `Tailscale-User-Login`. Hermes у Docker ходить до GBrain через
`host.docker.internal:3131`. Після чистого перезавантаження без ручного
запуску порти 3131, 4040, 8787, 9119 відповідають; ланцюг від краю до краю
прийнято на iPhone (§12.2).

## 2. Межа безпеки

| Що | Де живе | Де НЕ живе |
|---|---|---|
| Token GBrain (окремий, scope `read`) | `server/roma-gateway/.env` на Mac | фронтенд, bundle, localStorage, git |
| Token Hermes | файл `~/.hermes/roma-crow-token`, mode 600; у `.env` — **лише шлях** (`HERMES_TOKEN_FILE`) | `.env.example`, логи, відповіді, фронтенд, git |
| Адреса Hermes (`HERMES_WS_URL`) | `.env`, loopback | телефон |
| `stored_session_id` Hermes | `HERMES_SESSION_STATE_FILE` поза репо, mode 600 | репозиторій, телефон |
| Allowlist логінів Tailscale | `.env` (`ROMA_ALLOWED_LOGINS`) | репозиторій |
| Дозволені origin'и PWA | `.env` (`ROMA_ALLOWED_ORIGINS`), точні, не `*` | — |
| Адреса gateway | localStorage `roma_gateway_url` | — |

Ідентичність — це заголовок `Tailscale-User-Login`, який Serve додає до
кожного запиту зсередини tailnet. Без заголовка або з чужим логіном — `403`,
і для `/state`, і для `/crow`. Порожній allowlist = нікого не пускати.

Gateway читає token Hermes із файлу при кожному підключенні (ротація без
перезапуску), попереджає раз, якщо файл читають інші, і **ніколи** не пише
значення в лог: в логах — адреса без query і шлях до файлу.

GBrain: **один** інструмент — `recall` без `query`, з `limit` — і жодних
записів. Hermes: жодних записів у GBrain з телефона; що робить сам агент
усередині Hermes — його конфіг, ми його не чіпаємо.

## 3. Endpoint'и (адреси) gateway

| Метод, шлях | Ідентичність | Відповідь |
|---|---|---|
| `GET /api/v1/health` | не потрібна | `{ ok, version }` — без даних |
| `GET /api/v1/state` | потрібна | `{ memory: MemoryFact[], fetchedAt, source: "gbrain:recall", dropped }` |
| `POST /api/v1/crow` | потрібна | `CrowReply` — `{ requestId, text, chips: [], priority: "normal" }` |
| `OPTIONS *` | — | preflight для дозволеного origin (`POST` з JSON його потребує) |

`POST /api/v1/crow` бере `CrowRequest` з `src/hermes/contract.ts` як є:
`text`, `context: UiContext`, `history: CrowTurn[]`, `requestId`. Ліміти:
тіло 256 КБ, `text` 4000 символів, `history` 20 ходів по 2000, кожен рядок
контексту 300, списки по 20. Зайве обрізається; що не проходить — статус:

| Статус | `error` | Коли |
|---|---|---|
| `400` | `bad_request` | не JSON, не той контракт, немає `requestId` чи `context` |
| `400` | `empty_text` | порожнє повідомлення |
| `405` | `method_not_allowed` | не `POST` (у відповіді `Allow: POST`) |
| `409` | `busy` | попередній хід ще триває — паралельного `prompt.submit` не буває |
| `413` | `too_large` | тіло понад 256 КБ або `text` понад 4000 |
| `501` | `not_implemented` | `HERMES_TOKEN_FILE` у `.env` порожній — шов лишається |
| `502` | `hermes_unavailable` | Hermes не запущений, поганий token, обрив сокета |
| `502` | `hermes_failed` | хід завершився зі `status: error` або `interrupted` |
| `502` | `hermes_bad_response` | Hermes відповів не по контракту |
| `504` | `hermes_timeout` | немає `message.complete` за `HERMES_TURN_TIMEOUT_MS` |

Жодного stack trace, жодного тексту помилки Hermes у відповіді — лише код.
Якщо телефон обірвав запит, поки хід тривав, gateway шле `session.interrupt`.

## 4. Crow через Hermes — контракт runtime

Не вигаданий: прочитаний у коді upstream `NousResearch/hermes-agent`
(`tui_gateway/server.py`, `ws.py`, `methods_session.py`, `methods_prompt.py`,
`prompt_turn.py`, `contracts/events.py`) і збігається з тим, що Роман
перевірив Mac-клієнтом 21.09. У коді gateway живе в `src/hermes-protocol.ts`
(чисті функції) і `src/hermes-client.ts` (сокет, сесія, хід).

### 4.1. Транспорт і auth

- `ws://127.0.0.1:9119/api/ws?token=<token>` — legacy-token режим Hermes на
  loopback: token порівнюється constant-time, поганий → upgrade відхилено.
- Один кадр JSON-RPC 2.0 на одне текстове WebSocket-повідомлення.
- Одразу після upgrade Hermes шле першу подію — `gateway.ready`. Доти
  жодних запитів; connect-timeout рахується до неї.
- Heartbeat: `gateway.ping` → `{ ok: true }` кожні 15 с; 45 с без жодного
  вхідного кадру — сокет вважається мертвим (так роблять власні клієнти
  Hermes).

### 4.2. Життєвий цикл

```
←  {"jsonrpc":"2.0","method":"event","params":{"type":"gateway.ready","payload":{"heartbeat":true,…}}}

→  {"jsonrpc":"2.0","id":1,"method":"session.create","params":{"close_on_disconnect":false,"title":"Crow OS MP · Crow","messages":[{"role":"user","content":"…"},{"role":"assistant","content":"…"}]}}
←  {"jsonrpc":"2.0","id":1,"result":{"session_id":"<runtime>","stored_session_id":"<stored>","message_count":2,"messages":[],"info":{…}}}

   — або, коли <stored> уже є у файлі стану —
→  {"jsonrpc":"2.0","id":1,"method":"session.resume","params":{"session_id":"<stored>","omit_messages":true}}
←  {"jsonrpc":"2.0","id":1,"result":{"session_id":"<runtime>","session_key":"<stored>","resumed":"<stored>","inflight":null,"running":false,…}}

→  {"jsonrpc":"2.0","id":2,"method":"prompt.submit","params":{"session_id":"<runtime>","text":"<envelope>\n\n<слова Романа>"}}
←  {"jsonrpc":"2.0","id":2,"result":{"status":"streaming"}}
←  event message.start          {}                       (без payload)
←  event reasoning.delta        {"text":"…"}             ← ігноруємо
←  event thinking.delta         {"text":"…"}             ← ігноруємо
←  event tool.start / tool.generating / tool.complete    ← ігноруємо
←  event message.delta          {"text":"Маркер: "}      ← збираємо
←  event message.delta          {"text":"VIOLET-624"}    ← збираємо
←  event message.complete       {"text":"Маркер: VIOLET-624","status":"complete","usage":{…}}

→  {"jsonrpc":"2.0","id":3,"method":"session.interrupt","params":{"session_id":"<runtime>"}}   (лише при обриві/таймауті)
←  {"jsonrpc":"2.0","id":3,"result":{"status":"interrupted"}}
```

Кожна подія — `{"method":"event","params":{"type","session_id","seq","payload"}}`;
події чужих сесій відкидаються за `session_id`. `session.close` не викликаємо:
сесія живе між підключеннями (`close_on_disconnect: false`).

Коди помилок Hermes, на які gateway реагує: `4001` (runtime id уже не в
памʼяті → один `session.resume` збереженого id і повторний `prompt.submit`),
`4007` (збережений id не знайдено → один `session.create`), `-32601`
(наш власний код відповіді на запитання Hermes, див. 4.5).

### 4.3. Як поводиться gateway

- **Одна сесія Hermes на весь чат Crow.** Перший раз — `session.create`,
  `stored_session_id` пишеться в `HERMES_SESSION_STATE_FILE` атомарно
  (tmp + rename, mode 600, директорія 700). Після перезапуску gateway або
  Hermes — `session.resume`. Runtime `session_id` після кожного нового
  сокета береться з відповіді на resume заново. Назва сесії (`title`)
  задається лише при `session.create`: уже збережена сесія лишається з
  попередньою назвою («Roma OS · Crow» до 26.09).
- **Один контрольований fallback.** Resume відхилено (`4007`, `5000`, …) →
  файл стану чиститься → один `session.create` → якщо і він упав, відповідь
  `502`, без циклів. Обрив сокета чи таймаут під час resume нову сесію **не**
  породжують — інакше одна розмова роздвоїлась би.
- **Підключення за потребою.** Немає фонового reconnect-циклу: сокет
  відкривається, коли є що спитати, і живе, поки живий. Mac спить = `502`.
- **Один хід за раз.** Друге повідомлення під час ходу — `409 busy`, без
  другого `prompt.submit`. Якщо Hermes сам відповів `queued`/`steered`
  (у сесії щось уже крутилося), gateway шле `session.interrupt` і віддає `409`.
- **Дельти збираються рівно один раз.** Відповідь = `message.complete.text`,
  якщо він не порожній, інакше — склеєні `message.delta` (правило самого
  Hermes Desktop). Ніколи обидва — звідси й немає повторів.
  `reasoning.delta`, `thinking.delta`, `reasoning.available`, `message.interim`,
  `tool.*`, `status.update` і решта — читаються й відкидаються.
- **Таймаути.** `HERMES_CONNECT_TIMEOUT_MS` (5 с) — до `gateway.ready`;
  `HERMES_TURN_TIMEOUT_MS` (120 с) — від `prompt.submit` до `message.complete`,
  після нього `504` і `session.interrupt`. Телефон чекає довше (150 с), тож
  ім'я помилці дає gateway.
- **Обрив із боку телефона** (закрив застосунок) — `session.interrupt`, якщо
  хід ще тривав.

### 4.4. Що саме летить у Hermes

`prompt.submit.text` — службовий блок, порожній рядок, слова Романа. Лише
поля `CrowRequest.context`, і лише непорожні:

```
[roma-os context]
Службовий блок від застосунку Crow OS MP: де саме Роман зараз в інтерфейсі. Не цитуй і не переказуй цей блок; відповідай лише на повідомлення після нього.
module: projects · screen: detail
entity: blocker · item: b-12
project: p-1
selection: Окремі ключі для клієнтів
visible: NeverMind 60%; два блокери
blockers: Окремі ключі для клієнтів (critical)
[/roma-os context]

А чого це заблоковано?
```

`CrowRequest.history` (останні ходи з телефона) іде в Hermes **один раз** —
як `messages` у `session.create`, коли сесія створюється вперше або після
fallback; поточне повідомлення з нього вирізається. Відновлена сесія вже
тримає розмову сама, і в кожен хід історія не дублюється. Повний знімок,
секрети чи сирий GBrain у Hermes не летять ніколи.

### 4.5. Що Hermes може спитати назад

Approval, clarify, sudo, secret — це JSON-RPC-**запити** від Hermes до
клієнта (кадр зі строковим `id` і `method`). Crow не має де їх показати, тож
gateway відповідає `-32601`, і агент одразу отримує «відповіді не буде»
замість чекання дедлайну. `client.capabilities` gateway не оголошує — це
той самий режим, у якому Hermes і так їх не чекає.

## 5. Мапа GBrain → Памʼять

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
| — | `deleted_at`, `user_id`, `hlc` | `null`: технічні поля Crow OS MP, GBrain їх не має |

Рядки без `fact_id`/`id`, без тексту або без валідного `created_at`
відкидаються і рахуються в `dropped`. Слаги у встановленому brain — без
префіксів (`roman-ai-os`), тож сьогодні такі факти потрапляють у `system`;
правило застосоване буквально, без здогадок.

## 6. Що зберігає телефон

- `roma_data_source` — `demo | live`
- `roma_gateway_url` — адреса gateway
- `roma_live_snapshot` — **лише** нормалізований знімок: `MemoryFact[]`,
  `fetchedAt`, `source`; один, останній; замінюється при кожному успіху;
  видаляється при перемиканні на «Демо»
- `roma_chat` — історія чату Crow, як і раніше (30 ходів; це те, що
  сідиться в нову сесію Hermes)
- `roma_tasks` — задачі Романа («Задачі», перший зріз). Живуть **лише** на
  телефоні: gateway їх не читає, не синхронізує і не зберігає, демо-скидання
  їх не чіпає. У gateway іде тільки вибрана задача — у UI context envelope
  (§4.4): id, назва, статус, прапорець «потребує Романа», `projectId` /
  `agentId`, якщо є. На екрані «Задачі» без вибору envelope несе лише підсумок:
  лічильники за статусами і до пʼяти назв задач, що чекають Романа. Запису
  задач через Hermes/GBrain поки немає.

Не зберігається: сирі відповіді GBrain, сторінки, транскрипти Hermes, ключі,
адреса Hermes, будь-що, чого UI не показує.

## 7. Що зберігає gateway на Mac

- `HERMES_SESSION_STATE_FILE` (типово `~/.roma-gateway/hermes-session.json`):
  `{ "stored_session_id", "saved_at" }`. Видалити цей файл = почати нову
  сесію Hermes з наступного повідомлення (і засіяти її історією з телефона).
- Нічого більше: ні транскриптів, ні токенів, ні кешу відповідей. Кеш знімка
  Памʼяті — 10 с у памʼяті процесу.

## 8. Коли Mac спить або недосяжний

Оновлення Памʼяті не відбувається, Crow не відповідає. Памʼять показує
останній знімок із міткою «наживо» і рядком **«Оновлено N хв тому · Mac
недоступний»**. На демо застосунок мовчки не переходить. Причини словами:

| Помилка | Памʼять | Crow (у чаті) |
|---|---|---|
| адреса не задана | адресу gateway не задано | Hermes не підключений: адресу gateway не задано в налаштуваннях. |
| телефон офлайн | немає мережі | Немає зв’язку. Спробую ще раз, коли мережа повернеться. |
| DNS/VPN/Mac/`5xx` (`501`, `502`, `504`) | Mac недоступний | Hermes не відповідає. |
| `401`/`403` | немає доступу | Немає доступу до Hermes. |
| `409`/`429` | забагато запитів | Забагато запитів поспіль. Трохи зачекай. |
| `400`/`413`, не JSON, чужа форма | відповідь gateway не розпізнана | Відповідь Hermes не розпізнана. |

Оновлення Памʼяті: при старті, при `pageshow`, при поверненні застосунку у
видимість, і кожні 90 с, поки він видимий. Фонового опитування немає.

## 9. Як запустити gateway на Mac

> На Mac Романа gateway, GBrain і ngrok уже стартують як LaunchAgents, Hermes —
> у Docker (§1). Кроки нижче — для нового налаштування або ручного запуску.

1. У корені репо: `npm ci` (workspace встановить залежності gateway).
2. `cp server/roma-gateway/.env.example server/roma-gateway/.env` і заповнити:
   `ROMA_ALLOWED_LOGINS` (твій логін Tailscale), `GBRAIN_MCP_URL`,
   `GBRAIN_TOKEN` (див. §10), `HERMES_TOKEN_FILE` (шлях до файлу з токеном,
   значення в `.env` **не** класти). Решта `HERMES_*` мають дефолти.
3. Hermes має бути запущений у server mode на `127.0.0.1:9119` (на Mac
   Романа — Docker-контейнер, §1).
4. Запуск:

   ```bash
   npm run start --workspace server/roma-gateway
   ```

   У логах: `listening on http://127.0.0.1:8787 … · crow via Hermes` і рядок
   `hermes: ws://127.0.0.1:9119/api/ws · token file … · session state …`.
   Перезапуск — `Ctrl-C` (SIGINT закриває сокет, сесія Hermes лишається) і
   та сама команда знову.

5. Перевірки з терміналу на Mac (`<логін>` — твій логін Tailscale):

   ```bash
   curl http://127.0.0.1:8787/api/v1/health
   curl -H 'Tailscale-User-Login: <логін>' http://127.0.0.1:8787/api/v1/state
   curl -X POST -H 'Tailscale-User-Login: <логін>' -H 'Content-Type: application/json' \
     http://127.0.0.1:8787/api/v1/crow \
     -d '{"text":"Який маркер інтеграції Hermes-GBrain лежить у памʼяті?","context":{"activeModule":"control","activeScreen":"control","activeEntity":null,"selectedItem":null,"projectId":null,"agentId":null,"filters":{},"visibleState":[],"blockers":[],"selection":null},"history":[],"requestId":"curl-1"}'
   ```

   Очікувано: `{"requestId":"curl-1","text":"…VIOLET-624…","chips":[],"priority":"normal"}`.
   Друга така сама команда під час першої — `{"error":"busy"}` зі статусом 409.

6. Тести без Hermes і без GBrain (фейки): `npm run verify --workspace server/roma-gateway` — lint, типи, 63 тести.

## 10. Credential GBrain — один крок для Романа

Створити в GBrain **окремого клієнта** для gateway зі scope лише `read`
(не перевикористовувати токени Hermes, Claude Desktop чи Claude Code) і
вставити його token у `.env` як `GBRAIN_TOKEN`. Команда — з `gbrain auth --help`
на Mac (сімейство `gbrain auth …`; точний підкоманд перевірити там, тут не
вигадуємо). Gateway цей токен нікуди не передає, крім самого GBrain.

## 11. Tailscale Serve — перевірено на Mac та iPhone 21.09

Команду сюди записуємо **лише** після перевірки фактичної версії:

1. `tailscale version` (у macOS-застосунку CLI лежить у
   `/Applications/Tailscale.app/Contents/MacOS/Tailscale`).
2. `tailscale serve --help` — синтаксис саме цієї версії.
3. В адмінці tailnet мають бути увімкнені MagicDNS і HTTPS-сертифікати —
   інакше `https://<mac>.<tailnet>.ts.net` не підніметься.
4. Після цього — опублікувати `127.0.0.1:8787` через Serve (не Funnel: Funnel
   виставляє назовні і не додає заголовок ідентичності).
5. У Crow OS MP: Налаштування → Джерело даних → **Наживо** → адреса
   `https://<mac>.<tailnet>.ts.net`.

Хід Crow з інструментами може тривати 30–60 с: якщо Serve обірве довгу
відповідь, телефон побачить «Hermes не відповідає» — це перевіряється на
телефоні (`STAGE-1.md §6.5`), у хмарі не відтворити.

## 12. Приймання

### 12.1. Доведено локально (без Mac)

Фейковий Hermes на `ws` у `server/roma-gateway/test/fake-hermes.ts` говорить
кадрами з §4.2. Тести (`npm run verify --workspace server/roma-gateway`):
`gateway.ready`, `session.create` з `close_on_disconnect=false`, запис і
читання `stored_session_id`, `session.resume`, `prompt.submit`, збирання дельт
без дублювання, `message.complete`, ігнорування reasoning/thinking/tool-подій,
token лише в URL upgrade і ніде в логах, таймаут + interrupt, малформований
кадр, reconnect і перезапуск Hermes, `4001` → resume, `4007` → один create,
busy, обрив клієнта, валідація `POST /api/v1/crow`, неушкоджений
`GET /api/v1/state`. У застосунку: unit (мапа помилок, форма відповіді,
`askCrow` через живий gateway) і e2e `tests/e2e/crow-live.spec.ts` (envelope
летить, відповідь показується, `502` → «Hermes не відповідає», без адреси —
чесний текст, демо досі відповідає із заглушки і не торкається мережі).

### 12.2. Приймання на Mac та iPhone — що доведено, що ні

Реального Hermes у хмарній сесії немає, тому це приймання робить лише Роман.
**21.09 підтверджено на iPhone**, а не лише Mac-клієнтом: реальний ланцюг від
краю до краю Crow OS MP → Roma gateway → Hermes → GBrain повернув `VIOLET-624`
через справжній `recall`; після перезавантаження повторний запит повернув
`JADE-919`. Відповідь одна, без reasoning, повторів і службового блоку
`[roma-os context]`. У `STAGE-1.md §6.5` відмічено саме ці два пункти.

Без окремого доказу **не** вважається пройденим: рядок «Hermes» на Control у
режимі «Наживо», envelope з блокером, зупинений Hermes → зрозуміла помилка і
`session.resume` після запуску, перезапуск gateway у тій самій сесії Hermes,
Памʼять наживо під час відповіді Crow, довга відповідь через Serve (30–60 с).
Окремо помічено (Роман/GPT, 21.09): на прості запити Crow може віддавати
зайві службові деталі (fact ID, timestamps, provenance, visibility) — це
відкрита задача в backlog, не автоматично наступна; її місце визначиться
після Drive-аудиту. `HANDOFF.md` → «Відкрита продуктова задача в backlog».

## 13. Далі (не в цих зрізах)

Chips і priority з Hermes (зараз `[]` і `normal`); Проєкти/Блокери з
канонічного стану; «Потребує мене» як похідне; Події з `timeline`; Агенти
лише з того, що видно; фото в чат через Hermes; запис у GBrain з телефона —
останнім.
