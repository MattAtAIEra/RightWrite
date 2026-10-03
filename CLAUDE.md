# RightWrite

國小國語學習工具集。同一個前後端裡有三個入口：

- `/` **國語學習樂園** — 入口 portal，連到下面兩個應用
- `/rightwrite` **改錯字神器** — 單人改錯字練習（康軒版 114 學年度第 2 學期等）
- `/yzqj`、`/g/{code}` **一字千金** — 多人即時成語改錯競賽（QR Code 加入、九宮格手寫、筆跡實況轉播、排名、成績後台）。細節見 `README-yzqj.md`

## Development Commands

```bash
# Frontend (React + Vite)
cd frontend && npm install
npm run dev          # Dev server on :5173, proxies /api → localhost:8000
npm run build        # TypeScript check + Vite build → outputs to ../backend/static
npm run lint         # ESLint

# Backend (FastAPI)
cd backend && pip install -r requirements.txt
uvicorn main:app --reload   # Dev server on :8000
python -m pytest tests -q   # 一字千金整場流程的冒煙測試

# Calligraphy font subset (re-run after editing backend/idioms_data.py)
pip install fonttools brotli && python scripts/build_calligraphy_font.py

# Vocab scraper
cd scripts && python scrape_vocab.py   # Playwright-based, scrapes edu.tw textword API

# Docker
docker build -t rightwrite .           # 2-stage: node:20-slim → python:3.12-slim
```

## Architecture

**Stack**: React 19 + TypeScript / FastAPI + Uvicorn / Google Cloud Vision API

**3-stage user flow**: select (lesson range) → practice (find wrong chars + handwrite corrections) → result (accuracy summary)

**API endpoints** (backend/main.py):
- `GET /api/lessons` — lesson metadata
- `POST /api/generate` — generate article with intentional wrong characters
- `POST /api/recognize` — handwriting recognition via Vision API (fallback to dummy)
- `POST /api/check` — simple character comparison
- `GET /{path}` — SPA static file serving

**一字千金 endpoints** (backend/yzqj.py):
- `POST /api/yzqj/games` — create game → 3-char code + host_token
- `GET /api/yzqj/games/{code}` / `POST .../join` — game info / join with nickname (records IP, max 10)
- `WS /ws/yzqj/{code}?role=host&token=…` / `?role=player&player_id=…` — snapshots, stroke relay, submit
- `GET /api/yzqj/admin/games` — results backoffice (header `X-Admin-Token` when `YZQJ_ADMIN_TOKEN` is set)
- `GET/POST/DELETE /api/yzqj/idioms` — idiom bank (built-in + custom JSON at `YZQJ_IDIOMS_PATH`); write needs admin token
- `POST /api/yzqj/admin/recognize` — try the strict handwriting verdict on one image (debug)

**Frontend routing**: `frontend/src/main.tsx` picks the app by pathname (portal / rightwrite / yzqj);
一字千金 has its own tiny history-API router in `src/yzqj/router.ts`.

**Dev proxy**: Vite proxies `/api` and `/ws` to `localhost:8000`. In production, both served from same origin on :8080.

**Build output**: Frontend builds directly into `backend/static/` which is gitignored. Backend serves these as static files with SPA fallback to index.html.

## Key Patterns

**Vocab data** (backend/vocab_data.py): Dict keyed by lesson number. Each character has `char` and `similar_wrong` list (visually confusable characters). 14 lessons × ~14 chars each.

**Article generation**: Uses predefined sentence templates (not LLM-generated). Randomly picks 5-8 characters from selected lesson range, inserts into templates, then swaps some with similar_wrong alternatives. Tracks wrong char positions in display text.

**Recognition** (`backend/recognition.py`): 改錯字神器 runs Gemini thinking-low → escalate → Vision (in main.py). 一字千金 uses `recognize_character`: one Gemini call returning `{char, closest, clear}` against candidate characters (correct + question's wrong char + confusables from `vocab_data.get_similar_wrong`); all three must point at the correct char. Per-student timeout `YZQJ_RECOGNIZE_TIMEOUT` (default 8s) → counted wrong. Engines without credentials are skipped; with no credentials at all, fallback mode marks any ink as correct (0.5) and blank as wrong.

**Game state** (backend/yzqj.py): all live games are in-process memory (`GAMES` dict) with asyncio timers; results and a `question_log` are persisted to SQLite (`backend/yzqj_store.py`, path `YZQJ_DB_PATH`). Deploy as a single instance. Question picking avoids idioms from the last 6 rounds across games and never repeats within a game.

**Idiom bank** (backend/idioms_data.py): built-in `IDIOMS` plus custom entries in a JSON file (`YZQJ_IDIOMS_PATH`); `all_idioms()` merges both. In production the JSON lives on a Cloud Storage volume mounted at `/data` (see cloudbuild.yaml).

**Calligraphy font**: `frontend/public/fonts/ARPLUKaiTW-yzqj.woff2` is a subset of AR PL UKai TW containing only the idiom characters. Regenerate with `scripts/build_calligraphy_font.py` whenever `backend/idioms_data.py` changes.

**Environment variables**:
- `GOOGLE_APPLICATION_CREDENTIALS` — path to GCP service account JSON (for Vision API)
- `YZQJ_ADMIN_TOKEN` — password for the 一字千金 results backoffice (unset = open)
- `YZQJ_DB_PATH` — SQLite path for game results (default `backend/data/yzqj.sqlite3`)
- `YZQJ_QUESTION_SECONDS` (default 18) / `YZQJ_REVEAL_SECONDS` / `YZQJ_GRACE_SECONDS` — timing overrides (tests use short values)
- `YZQJ_RECOGNIZE_TIMEOUT` — seconds to wait for one student's recognition before counting it wrong (default 8)
- `YZQJ_IDIOMS_PATH` — custom idiom JSON (default `backend/data/custom_idioms.json`; Cloud Run uses `/data/custom_idioms.json`)

## Frontend Aesthetics

When generating or modifying frontend UI, always follow these principles:

**Typography**: Use distinctive, beautiful fonts — avoid generic choices like Arial, Inter, Roboto, or system fonts. For this project, use "ZCOOL KuaiLe" for headings (playful/bubbly) and "LXGW WenKai TC" for body text (warm handwriting feel). Both are Google Fonts.

**Color & Theme**: Commit to a cohesive, kid-friendly aesthetic. Use CSS variables for consistency. The palette is warm and playful: coral primary, teal accents, sunny yellow highlights, soft cream backgrounds. Avoid generic blue-on-white or purple gradients.

**Motion**: Use CSS animations for page load reveals (staggered `animation-delay`), hover micro-interactions, and transitions. Prefer CSS-only solutions. Focus on high-impact moments: bouncy entrances, wobble effects, and celebratory animations on results.

**Backgrounds**: Create atmosphere with layered gradients, geometric patterns (polka dots, waves), and contextual decorative elements. Never default to flat solid colors.

**Kid-Friendly Design**: This is for elementary school children (國小四年級). Use:
- Large, readable text with generous spacing
- Playful SVG illustrations (happy characters, stars, pencils, books)
- Rounded, bubbly shapes
- Bright, engaging colors that feel like a fun adventure
- Celebratory feedback (confetti, stars, bouncing emojis)

**Avoid**:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (purple gradients on white)
- Predictable layouts and cookie-cutter patterns
- Generic "AI slop" aesthetics — make creative, distinctive choices

## Deployment

Google Cloud Run on `asia-east1` via `cloudbuild.yaml`:
- 512Mi memory, 1 CPU, 0-1 instances (single instance: 一字千金 keeps game state in memory), request timeout 3600s for WebSockets
- gen2 execution environment with Cloud Storage bucket `rightwrite-data-teamfollowme` mounted at `/data` (custom idioms persist across restarts)
- Port 8080, unauthenticated access
- Multi-stage Dockerfile: frontend build → copy static assets into Python image
