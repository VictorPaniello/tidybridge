# Second device setup (Fedora): run and develop tidybridge on two PCs

For Claude on the **new PC**: read this first, then
`2026-10-12-llm-provider-handoff.md` for where the work stands. Victor
wants to work on the app from **both** PCs. Walk him through this one
section at a time and check each step's result before moving on. Steps
that need `sudo` or a login are his to run (he types `! <command>`).

## What lives where

| Thing | Where it lives | How it gets to the new PC |
|---|---|---|
| Code, plans, handoffs | GitHub `VictorPaniello/tidybridge` | `gh repo clone` |
| `tidycsv` (dependency) | GitHub, installed by `uv sync` from its git URL | automatic |
| `.env`, `frontend/.env.local` | old PC only (gitignored) | **private copy** (bundle below) |
| Local dev database `tidybridge` | old PC's Postgres | **`pg_dump` → `pg_restore`** (bundle below) |
| Test database `tidybridge_test` | old PC's Postgres; emptied on every test run | **not copied**, just created empty |
| Claude config (`~/.claude/CLAUDE.md`, `settings.json`) and tidybridge memory | old PC only | bundle below |
| Brand kit `~/projects/tidybridge-brand` | old PC only, **private, never in git or anywhere public** | bundle below |
| `.scratch/` (two old Sept handoffs) | old PC only | optional, in the bundle |
| Staging/production (Railway, Vercel, Cloudflare, Resend, Mistral) | the cloud | just log in, nothing to install |
| graphify | per machine | reinstall (step 8) |

## Part A: on the OLD PC (Victor runs these)

```bash
# 1. Postgres doesn't start at boot here
sudo systemctl start postgresql

# 2. Dump the local dev database (custom format, restorable anywhere)
cd ~/projects/tidybridge
DBURL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/+psycopg//')
pg_dump --format=custom --no-owner --no-privileges "$DBURL" -f ~/tidybridge-dev.dump
ls -la ~/tidybridge-dev.dump

# 3. One private bundle with everything that isn't in git
cd ~ && tar czf ~/tidybridge-transfer.tgz \
  .claude/CLAUDE.md .claude/settings.json \
  .claude/projects/-home-victorpaniello-projects-tidybridge/memory \
  projects/tidybridge/.env projects/tidybridge/frontend/.env.local \
  projects/tidybridge/.scratch \
  projects/tidybridge-brand \
  tidybridge-dev.dump
ls -la ~/tidybridge-transfer.tgz
```

Copy `~/tidybridge-transfer.tgz` to the new PC by **USB stick or another
private channel**. It contains secrets (`.env`), local data and the
private brand kit, so **not** by email, a cloud link or a chat. Delete the
copy from the USB stick afterwards. (The earlier
`claude-config-transfer.tgz` is a subset of this; ignore it.)

## Part B: on the NEW PC (Fedora)

### 1. System tools
```bash
sudo dnf install -y git gh uv postgresql-server postgresql
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# reopen the terminal
nvm install 24 && nvm alias default 24
curl -fsSL https://claude.ai/install.sh | bash
# reopen the terminal
git --version; gh --version; uv --version; node -v; psql --version; claude --version
```
Old PC versions, for reference: PostgreSQL 18, uv 0.11, Node 24, gh 2.97.

### 2. GitHub and git identity
```bash
gh auth login
git config --global user.name "Victor Paniello"
git config --global user.email "<same as on the old PC: git config --global user.email>"
```
Commits must be authored by Victor only, with no Claude co-author lines.
`settings.json` (step 4) carries the `attribution` setting that ensures
this.

### 3. Unpack the bundle (before opening Claude Code)
```bash
cd ~ && tar xzf /path/to/tidybridge-transfer.tgz
```
This creates `~/.claude/...`, `~/projects/tidybridge/.env`,
`frontend/.env.local`, `.scratch/`, `~/projects/tidybridge-brand/` and
`~/tidybridge-dev.dump`.
- **If the username or the repo path differs**, rename the memory folder
  to the new path with `/` replaced by `-`. For example,
  `/home/victor/projects/tidybridge` →
  `~/.claude/projects/-home-victor-projects-tidybridge/`.

### 4. Clone the repo into the folder the bundle created
The bundle already created `~/projects/tidybridge/` (with `.env` in it),
so clone into it:
```bash
cd ~/projects/tidybridge
git init -q && git remote add origin https://github.com/VictorPaniello/tidybridge.git
git fetch -q origin && git checkout -q -t origin/staging
git status   # .env, frontend/.env.local, .scratch/ show as ignored, nothing else
```

### 5. PostgreSQL: dev and test databases
```bash
sudo postgresql-setup --initdb
# Fedora defaults to "ident" for TCP; the app logs in with a password
sudo sed -i 's/^\(host.*127.0.0.1\/32\s*\)ident/\1scram-sha-256/; s/^\(host.*::1\/128\s*\)ident/\1scram-sha-256/' /var/lib/pgsql/data/pg_hba.conf
sudo systemctl enable --now postgresql
```
- **Test DB.** `tests/conftest.py` defaults to
  `postgres:postgres@127.0.0.1:5432/tidybridge_test`:
  ```bash
  sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" -c "CREATE DATABASE tidybridge_test;"
  ```
- **Dev DB.** Use the user, password and database name from `.env`'s
  `DATABASE_URL`. If it's `postgres:postgres`, skip `CREATE USER`:
  ```bash
  sudo -u postgres psql -c "CREATE USER <user> PASSWORD '<password>';"   # only if not postgres
  sudo -u postgres psql -c "CREATE DATABASE tidybridge OWNER <user>;"
  DBURL=$(grep '^DATABASE_URL=' ~/projects/tidybridge/.env | cut -d= -f2- | sed 's/+psycopg//')
  pg_restore --no-owner --no-privileges -d "$DBURL" ~/tidybridge-dev.dump
  ```
  Then check `psql "$DBURL" -c "select count(*) from client_records;"`. It
  should match the old PC.

### 6. Dependencies, migrations, tests
```bash
cd ~/projects/tidybridge
uv sync --extra dev
uv run alembic upgrade head          # no-op if the dump is current
uv run pytest -q                     # 227+ pass
uv run ruff check .
cd frontend && npm install && npx vitest run && npm run lint && cd ..
cd marketing && npm install && npm run lint && cd ..
```

### 7. Run the app locally
```bash
# terminal 1 - API on :8000
cd ~/projects/tidybridge && uv run uvicorn tidybridge.main:app --reload --app-dir src
# terminal 2 - frontend (VITE_API_URL in frontend/.env.local points at the API)
cd ~/projects/tidybridge/frontend && npm run dev
# marketing site, if needed
cd ~/projects/tidybridge/marketing && npm run dev
```
Log in with the same local account as on the old PC (it came over in the
dump).

### 8. Claude Code and graphify
- Run `claude` inside `~/projects/tidybridge`, log in, and check that the
  plugins from `settings.json` are installed (`/plugin`): superpowers,
  ponytail, mattpocock-skills, frontend-design, taste-skill, playwright,
  security-guidance.
- graphify (optional, code-only graph rebuilt on commit and checkout):
  ```bash
  uv tool install graphifyy && graphify install
  cd ~/projects/tidybridge && graphify hook install && graphify update .
  rm .gitattributes   # created by hook install, not needed (graph.json is gitignored)
  ```
  Skip `graphify claude install` (see the LLM provider handoff for why).

### 9. Clean up
Delete `~/tidybridge-dev.dump` and the bundle once everything works.

## Working from two PCs (the rules)
- **Git is the only sync.** Before starting on either PC:
  `git fetch && git switch staging && git pull`. Before leaving: commit
  and push the branch, even work in progress, or the other PC won't have it.
- **Claude's memory does not sync** (`~/.claude/projects/.../memory` is
  per machine). The **handoffs in `docs/superpowers/handoffs/` are the
  shared memory**: end a session on one PC with a handoff PR, and start
  on the other with "read the latest handoff". If a memory note changes on
  one PC, mention it in the handoff.
- **The local dev databases drift apart.** That's fine; they only hold
  test data (real data lives on Railway). Re-copy with the `pg_dump` /
  `pg_restore` steps if ever needed. Migrations come with the code:
  run `uv run alembic upgrade head` after pulling.
- **`.env` changes are manual.** If a local env var is added on one PC
  (for example `MISTRAL_API_KEY` or a Groq key), add it on the other by
  hand, privately. Railway and Vercel variables live in the cloud and
  don't need copying.
- **The brand kit is private and outside git.** If it changes on one PC,
  copy it privately. Never commit it, publish it or link it (see the
  `brand-kit-private` memory).
- **Postgres:** on the new PC it's enabled at boot (step 5). On the old PC
  it isn't: `sudo systemctl start postgresql` before tests.
