# /start — старт сесії Roma OS

Перша команда в кожному новому чаті. Один виклик — і є мінімальний, але
достатній контекст, щоб говорити по суті.

**Без аргументів.** Просто `/start`.

**Принцип:** спочатку мінімальний контекст, глибший — тільки коли задача
його вимагає. Не читати весь репозиторій і не тягнути 100+ КБ документації
наперед.

---

## A. ЗАВЖДИ — у цьому порядку

### 1. `CLAUDE.md` — повністю, перший Read у сесії

Не «він і так у контексті як project instructions». Активно прочитати файл
цілком. Якщо перший Read сесії не `CLAUDE.md` — правило порушено.

### 2. `docs/roma-os/HANDOFF.md` → блок «ПОТОЧНИЙ СТАН»

Тільки цей блок — перша секція файлу (`## ПОТОЧНИЙ СТАН`), до наступного
`---`. Решта HANDOFF — стабільний бриф (що будуємо, що брати з NeverMind,
критерії Етапу 1); читається за потреби, а не щоразу.

### 3. `docs/roma-os/SESSION_LOG.md` → останній блок

Від початку файлу до **другого** заголовка `## ` — це остання сесія.
Глибше не читати.

### 4. `docs/roma-os/ISSUES.md` → тільки `open`

Відкриті записи й усе з `priority: critical`. Закриті (`fixed`/`verified`/
`wontfix`) на старті не потрібні.

### 5. Git — фактичний стан

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git log --oneline -5
git fetch origin main && git rev-parse origin/main
git merge-base --is-ancestor HEAD origin/main && echo "HEAD вже в main"
git ls-remote --heads origin "$(git branch --show-current)"
```

Останні два рядки важливі: робоча гілка може бути вже змержена в `main`
(тоді `git log <гілка> --not main` покаже нуль комітів і збреше), або ще
не існувати на remote.

### 6. CI поточної гілки

`mcp__github__actions_list` → `list_workflow_runs`, `resource_id: ci.yml`,
фільтр по гілці. `success` / `failure` / прогону не було.
Якщо червоний — `mcp__github__get_job_logs` з `failed_only` і назвати
конкретний крок.

### 7. Останній deploy `main`

`resource_id: deploy.yml`, гілка `main`. Звірити `head_sha` прогону
з `origin/main`: якщо не збігається — живий URL відстає від `main`.

### 8. `.claude/.session-runtime.json`

Файл gitignored — це службові метадані сесії, не продукт. Створювати
**без** «РОБИ». Якщо вже існує — **не перезаписувати**, узяти той самий
`session_id`.

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

`session_id` = `YYYYMMDD-HHMM-<суфікс гілки>` (для `claude/cool-curie-51d0l9`
суфікс `51d0l9`; для `main` — `main`).

### 9. HOT RULES — останнім

Перечитати секцію `HOT RULES` з `CLAUDE.md` **перед** першою реплікою, щоб
правила були в свіжій пам'яті, а не десь на початку контексту.

---

## B. ЗА ПОТРЕБОЮ — тільки коли задача цього вимагає

| Джерело | Коли читати |
|---|---|
| `docs/roma-os/STAGE-0.md` | задача зачіпає продуктове або архітектурне рішення |
| `docs/roma-os/STAGE-1.md` | релевантні секції поточного етапу |
| `docs/roma-os/PORTING.md` | задача про UI/UX/механіку, яка може вже бути в NeverMind |
| `docs/roma-os/mockup.html` | задача про композицію екрана |
| код NeverMind | тільки під конкретний компонент, після `PORTING.md` |

NeverMind клонується читанням, не редагується:

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 \
  https://github.com/OWLs68/NeverMind /home/user/owls68/nevermind
```

---

## C. Відповідь Роману — 8–10 рядків, не більше

Українською. Технічні англійські терміни — з поясненням у дужках.

1. Де зупинились (один рядок з «ПОТОЧНИЙ СТАН» + остання сесія)
2. `Branch: … · HEAD: … ` (+ «вже в main», якщо так)
3. `CI: ✅/⚠️ …`
4. `Live: ✅/⚠️ …` (deploy `main` і чи він на поточному `main`)
5. Найважливіший blocker або `open` issue — одним реченням
6. 3–4 логічні варіанти наступної роботи, нумеровано
7. «Що робимо?»

Якщо CI червоний — окремим рядком і варіантом «полагодити CI».

---

## D. STOP

Після відповіді **зупинитись**. Не чіпати продуктовий код (`src/`,
`index.html`, `style.css`, `sw.js`, `build.js`, тести, workflow) без явного
**«РОБИ»** від Романа.

Дозволено без «РОБИ» тільки `.claude/.session-runtime.json` — це метадані
сесії, а не зміна продукту.
