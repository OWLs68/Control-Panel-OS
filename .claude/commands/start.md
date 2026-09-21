# /start — старт сесії Roma OS

Перша команда в кожному новому чаті. Мінімальний, але достатній контекст,
щоб говорити по суті. Не читати весь репозиторій наперед.

**Без аргументів.** Просто `/start`.

---

## A. ЗАВЖДИ — у цьому порядку

### 1. `CLAUDE.md` — повністю, перший Read у сесії

Активно прочитати файл цілком, не покладатись на копію в контексті.

### 2. Хвости попередніх сесій — підтягнути, перш ніж читати стан

`/finish` пише документи на **свою** гілку і в `main` не мерджить. Тому
найсвіжіший стан може лежати не в `main`, а на гілці попередньої сесії.
Не підтягнути — читати застарілий `HANDOFF.md`.

```bash
git fetch -q origin main 'refs/heads/claude/*:refs/remotes/origin/claude/*'
for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/claude/); do
  git merge-base --is-ancestor "$b" origin/main && continue          # уже в main
  [ -z "$(git log --oneline origin/main.."$b")" ] && continue          # порожня
  if [ -z "$(git diff --stat origin/main..."$b" -- . ':!docs' ':!CLAUDE.md' ':!.claude' ':!README.md')" ]; then
    echo "DOCS-TAIL: $b"      # лише документи → влити
  else
    echo "CODE-TAIL: $b"      # є продуктовий код → НЕ вливати, назвати в звіті
  fi
done
```

`DOCS-TAIL` → влити в поточну гілку **і** в `main` merge-комітом
(документи не потребують перевірок; HOT RULE 3), push обох. `CODE-TAIL` →
не чіпати, сказати Роману.

### 3. `docs/roma-os/HANDOFF.md` → тільки блок «ПОТОЧНИЙ СТАН»

Рівно від `## ПОТОЧНИЙ СТАН` до наступного рядка `---`, не далі:

```bash
awk '/^## ПОТОЧНИЙ СТАН/{p=1;next} p&&/^---$/{exit} p' docs/roma-os/HANDOFF.md
```

### 4. `docs/roma-os/SESSION_LOG.md` → останній блок

Від першого `## ` до другого `## ` (разом із його «### Доповнення»):

```bash
awk '/^## /{c++} c==2{exit} c>=1' docs/roma-os/SESSION_LOG.md
```

### 5. `docs/roma-os/ISSUES.md` → тільки відкриті

```bash
grep -n -E '^### ISS-|status:|priority:' docs/roma-os/ISSUES.md | grep -B1 -A1 -E 'open|fixed|critical'
```

### 6. Git — фактичний стан

```bash
git branch --show-current; git rev-parse --short HEAD; git status --short
git log --oneline -5
git rev-parse --short origin/main
git merge-base --is-ancestor HEAD origin/main && echo "HEAD вже в main"
git ls-remote --heads origin "$(git branch --show-current)"
```

### 7. CI і deploy — по одному запиту, по одному прогону

`mcp__github__actions_list` → `list_workflow_runs`:
- `resource_id: ci.yml`, `workflow_runs_filter: {"branch": "main"}`, **`perPage: 1`**
- `resource_id: deploy.yml`, той самий фільтр, `perPage: 1`

`per_page` (з підкресленням) і фільтр `head_sha` інструмент ігнорує і
віддає всі прогони — це 6–12 тис. токенів за раз. Тільки `perPage`.
Червоний CI → `get_job_logs` з `failed_only: true`, `tail_lines: 80`.
Deploy: звірити `head_sha` з `origin/main` — не збігається, живий URL відстає.

### 8. `.claude/.session-runtime.json`

Gitignored. Якщо є — **не перезаписувати**: попередній `/finish` не дійшов
до кінця, доробити ту сесію. Немає → створити:

```bash
mkdir -p .claude
if [ ! -f .claude/.session-runtime.json ]; then
  BR=$(git branch --show-current)
  cat > .claude/.session-runtime.json <<JSON
{
  "session_id": "$(date -u +%Y%m%d-%H%M)-${BR##*-}",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "branch": "$BR",
  "start_head": "$(git rev-parse HEAD)",
  "start_main": "$(git rev-parse origin/main)"
}
JSON
fi
cat .claude/.session-runtime.json
```

Поточний HEAD із документів не читається ніколи — тільки з git.

### 9. HOT RULES — останнім, перед першою реплікою

`sed -n '/^## HOT RULES/,/^---/p' CLAUDE.md`

---

## B. ЗА ПОТРЕБОЮ — тільки коли задача вимагає

| Джерело | Коли |
|---|---|
| `STAGE-0.md` | продуктове чи архітектурне рішення |
| `STAGE-1.md` | релевантні секції етапу, чеклісти для телефона |
| `PORTING.md` | будь-який UI-компонент, що є в NeverMind |
| `GATEWAY.md` | живі дані, gateway, Tailscale, GBrain |
| `mockup.html` | композиція екрана |
| код NeverMind | під конкретний компонент, після `PORTING.md` |

NeverMind клонується читанням, не редагується:
`GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/OWLs68/NeverMind /home/user/owls68/nevermind`

---

## C. Відповідь Роману — 8–10 рядків

Українською, технічні терміни з поясненням у дужках. Час — Романа (UTC+2),
не UTC.

1. Де зупинились (рядок зі стану + остання сесія)
2. `Branch: … · HEAD: …` (+ «вже в main»), влиті хвости, якщо були
3. `CI: ✅/⚠️ …` 4. `Live: ✅/⚠️ …`
5. Найважливіший blocker або `open` issue
6. 3–4 варіанти наступної роботи, нумеровано
7. «Що робимо?»

## D. STOP

Після відповіді зупинитись. Продуктовий код — тільки після явного
**«РОБИ»**. Без «РОБИ» дозволено лише `.claude/.session-runtime.json`
і вливання docs-хвостів із кроку 2.
