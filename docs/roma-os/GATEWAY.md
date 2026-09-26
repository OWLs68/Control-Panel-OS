# Roma gateway (`server/roma-gateway`) — як Crow OS MP читає GBrain, говорить з Hermes і веде стрічку подій

Три вертикальні зрізи живих даних через один сервіс на Mac:

- **зріз 1 (21.09):** Памʼять із GBrain, лише читання;
- **зріз 2 (21.09, сесія dmm98t):** Crow через Hermes — одна чиста відповідь
  на кожне повідомлення;
- **зріз 3 (26.09, сесія 51tdj4):** Event Center — справжні події від
  producer'ів на Mac (агенти, Crow/Hermes, поки що `curl`) у стрічці «Події»
  і на Control (§5.1).

Агенти, Проєкти, Блокери і «Потребує мене» — поки демо, і позначені як демо.

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

producer на тому ж Mac (curl; згодом агенти) ──POST /api/v1/events, Bearer token──▶ 127.0.0.1:8787
                                                              (не через Serve)          └─▶ ~/.roma-gateway/events.json (§5.1)
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
| Token producer'ів подій | файл (типово `~/.roma-gateway/events-token`), mode 600; у `.env` — **лише шлях** (`ROMA_EVENTS_TOKEN_FILE`) | `.env.example`, логи, відповіді, телефон, git |
| Файл подій | `ROMA_EVENTS_FILE` (типово `~/.roma-gateway/events.json`) поза репо, mode 600 | репозиторій |

Ідентичність — це заголовок `Tailscale-User-Login`, який Serve додає до
кожного запиту зсередини tailnet. Без заголовка або з чужим логіном — `403`,
і для `/state`, і для `/crow`. Порожній allowlist = нікого не пускати.

`POST /api/v1/events` — навпаки: лише для producer'ів **на самому Mac**.
Запит із заголовком `Tailscale-User-Login` (тобто той, що прийшов через Serve
з телефона чи tailnet) — `403`, навіть із правильним token. Пускає тільки
`Authorization: Bearer <token>`: token читається з файла при кожному записі
(ротація без перезапуску) і порівнюється за сталий час. Телефон подій не
пише ніколи; CORS заголовка `Authorization` не дозволяє, тож браузер не
зміг би й спробувати.

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
| `GET /api/v1/state` | потрібна | `{ memory: MemoryFact[], fetchedAt, source: "gbrain:recall", dropped, events? }` — `events` (50 найновіших `SystemEvent`) лише коли Event Center увімкнений |
| `POST /api/v1/crow` | потрібна | `CrowReply` — `{ requestId, text, chips: [], priority: "normal" }` |
| `POST /api/v1/events` | **не через Serve** + producer token | `201 { id, duplicate: false }` або `200 { id, duplicate: true }` (§5.1) |
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

## 5.1. Event Center — справжні події (зріз 3)

Значуща діяльність Crow/Hermes і агентів спершу стає структурованою подією;
«Події» — її історія. Порядок (Product Spec §7): real Events pipeline →
notification policy → WebPush. Push — шар доставки поверх, не сховище, і в
цьому зрізі його немає.

```
producer на Mac ──POST /api/v1/events──▶ Roma gateway ──▶ ~/.roma-gateway/events.json
                                            │
iPhone ◀── GET /api/v1/state (events) ◀─────┘  → live-adapter → «Події», Control
```

**Чому біля gateway, а не в GBrain timeline.** Події — операційний потік, а
не довга памʼять (Core Rules §7). `add_timeline_entry` GBrain приймає лише
дату без часу і не має полів виду, агента чи `needsRoman`. Сам Shopping Scout
теж тримає свій стан у власній SQLite, а не в GBrain.

**Контракт (що шле producer).** Тіло до 16 КБ:

```json
{
  "id": "shopping-scout:deal:42",
  "kind": "agent_started | agent_result | agent_finished | agent_blocked | alert",
  "title": "Old Amsterdam −35% у Dirk Almere",
  "detail": "2,49 € замість 3,85 €, до неділі",
  "source": "shopping-scout",
  "agentId": "shopping-scout", "taskId": null, "projectId": null,
  "severity": "info | warning | critical",
  "needsRoman": true,
  "ts": "2026-09-26T12:40:00+02:00"
}
```

- Обовʼязкові: `kind`, `title` (до 140, один рядок), `source` (до 60).
- `id` — ключ повтору, який обирає producer (`[A-Za-z0-9._:-]`, до 128):
  той самий `id` удруге нічого не змінює (`200`, `duplicate: true`) — retry
  після таймауту безпечний. Без `id` gateway ставить UUID.
- `needsRoman` — **прапорець поверх виду**, як у задачі, не окремий вид:
  «агент чекає рішення» = `agent_blocked` або `agent_result` з `needsRoman: true`.
- `severity` типово `info`; `detail` до 1000; `ts` — мс або ISO з offset,
  типово час прийому; більш ніж на 5 хв у майбутньому — відмова.
- Gateway додає конверт сутності (`created_at` = час прийому, `user_id`,
  `hlc`, `deleted_at` — `null`) і зберігає повний `SystemEvent`
  (`src/data/types.ts`) — той самий контракт, що в демо-стрічці.

**Відповіді.** `201` нова · `200` повтор · `400 { error: "invalid_event", field }`
(поле названо) або `bad_request` (не JSON) · `401 unauthorized` (немає чи не
той token) · `403 forbidden` (через Serve) · `405` (не `POST`) · `413` (понад
16 КБ) · `501 not_implemented` (Event Center вимкнений) · `503
events_unavailable` (файл token не читається) · `500 store_failed`.

**Сховище.** Один JSON-файл, 500 найновіших, атомарний запис (tmp + rename),
записи по черзі (два producer'и водночас не затирають один одного);
пошкоджений файл відкладається як `events.json.corrupt-<ts>`, а не
перезаписується. У знімок `/state` — 50 найновіших, читаються щоразу, поза
10-секундним кешем Памʼяті.

**Вимкнено.** Без `ROMA_EVENTS_TOKEN_FILE` Event Center вимкнений: `POST` —
`501`, у знімку немає ключа `events`, і телефон показує демо-стрічку з
рядком «Живих подій ще немає: Event Center на Mac не ввімкнений».

**Відоме обмеження.** Якщо GBrain лежить, `/state` відповідає `502`, і
події теж стають застарілими — до наступного вдалого оновлення. Найчастіша
причина (Mac спить) і так вимикає обидва.

## 6. Що зберігає телефон

- `roma_data_source` — `demo | live`
- `roma_gateway_url` — адреса gateway
- `roma_live_snapshot` — **лише** нормалізований знімок: `MemoryFact[]`,
  події (`SystemEvent[]`, якщо Event Center увімкнений), `fetchedAt`,
  `source`; один, останній; замінюється при кожному успіху; видаляється при
  перемиканні на «Демо». Подію, яку телефон не вміє показати (вид, якого він
  ще не знає), він пропускає, а не відкидає весь знімок
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
- `ROMA_EVENTS_FILE` (типово `~/.roma-gateway/events.json`): події Event
  Center, 500 найновіших (§5.1). Видалити файл = почати стрічку з нуля.
- Нічого більше: ні транскриптів, ні токенів, ні кешу відповідей. Кеш знімка
  Памʼяті — 10 с у памʼяті процесу.

## 8. Коли Mac спить або недосяжний

Оновлення Памʼяті й подій не відбувається, Crow не відповідає. Памʼять і
Події показують останній знімок із міткою «наживо» і рядком **«Оновлено N хв
тому · Mac недоступний»**. На демо застосунок мовчки не переходить. Причини словами:

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
   Для подій — `ROMA_EVENTS_TOKEN_FILE` і файл token (крок 7).
3. Hermes має бути запущений у server mode на `127.0.0.1:9119` (на Mac
   Романа — Docker-контейнер, §1).
4. Запуск:

   ```bash
   npm run start --workspace server/roma-gateway
   ```

   У логах: `listening on http://127.0.0.1:8787 … · crow via Hermes · events on`
   і рядки `hermes: ws://127.0.0.1:9119/api/ws · token file … · session state …`,
   `events: store … · token file …`.
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

6. Тести без Hermes і без GBrain (фейки): `npm run verify --workspace server/roma-gateway` — lint, типи, 83 тести.

7. Event Center (зріз 3), один раз на Mac:

   ```bash
   mkdir -p ~/.roma-gateway && chmod 700 ~/.roma-gateway
   (umask 077 && openssl rand -hex 32 > ~/.roma-gateway/events-token)   # одразу 600, значення ніде не друкується
   ```

   У `server/roma-gateway/.env` дописати (лише шляхи):

   ```bash
   ROMA_EVENTS_TOKEN_FILE=~/.roma-gateway/events-token
   ROMA_EVENTS_FILE=~/.roma-gateway/events.json
   ```

   Перезапустити gateway. `curl http://127.0.0.1:8787/api/v1/health` →
   `"version":"0.3.0"`. Тестова подія:

   ```bash
   curl -s -X POST http://127.0.0.1:8787/api/v1/events \
     -H "Authorization: Bearer $(cat ~/.roma-gateway/events-token)" \
     -H 'Content-Type: application/json' \
     -d '{"id":"curl:test:1","kind":"alert","title":"Тест з Mac","source":"curl","needsRoman":true}'
   ```

   Очікувано: `{"id":"curl:test:1","duplicate":false}`; та сама команда
   вдруге — `{"id":"curl:test:1","duplicate":true}`. Без token — `401`.
   На iPhone у «Наживо»: відкрити застосунок (або повернутись у нього) —
   подія в «Подіях» з міткою «наживо» і бейджем «потребує мене»
   (`STAGE-1.md §6.7`).

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
`GET /api/v1/state`. Event Center (`test/events.test.ts`, `server.test.ts`):
контракт і назване поле, конверт, файл 600, повтор `id`, ліміт 500, два
записи водночас, пошкоджений файл, token; маршрут на справжньому сокеті —
`201`, повтор, `401`, `403` через Serve, `405`, `400`, `413`, `503`, вимкнено
= `501` і немає ключа `events`. У застосунку: unit (мапа помилок, форма відповіді,
`askCrow` через живий gateway) і e2e `tests/e2e/crow-live.spec.ts` (envelope
летить, відповідь показується, `502` → «Hermes не відповідає», без адреси —
чесний текст, демо досі відповідає із заглушки і не торкається мережі) і
`tests/e2e/live.spec.ts` (живі події на «Подіях» і Control, `needsRoman`,
кеш із подіями, gateway без Event Center → демо з поясненням, Mac спить →
останні події з причиною).

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

Event Center (зріз 3) на Mac і iPhone ще **не** прийнятий: потрібні кроки
§9.7 і перевірка `STAGE-1.md §6.7`.

## 13. Далі (не в цих зрізах)

Перший справжній producer подій — Shopping Scout (окремим рішенням, після
PASS зрізу 3); notification policy, потім WebPush — поверх Event Center, не
замість нього; Chips і priority з Hermes (зараз `[]` і `normal`);
Проєкти/Блокери з канонічного стану; «Потребує мене» з реальних задач і
подій; Агенти лише з того, що видно; фото в чат через Hermes; запис у GBrain
з телефона — останнім. (Колишній пункт «Події з `timeline`» GBrain знято:
події живуть в Event Center, §5.1.)
