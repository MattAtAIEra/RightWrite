# RightWrite

國小四年級國語改錯字練習應用（康軒版 114 學年度第 2 學期）。

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

**Dev proxy**: Vite proxies `/api` to `localhost:8000`. In production, both served from same origin on :8080.

**Build output**: Frontend builds directly into `backend/static/` which is gitignored. Backend serves these as static files with SPA fallback to index.html.

## Key Patterns

**Vocab data** (backend/vocab_data.py): Dict keyed by lesson number. Each character has `char` and `similar_wrong` list (visually confusable characters). 14 lessons × ~14 chars each.

**Article generation**: Uses predefined sentence templates (not LLM-generated). Randomly picks 5-8 characters from selected lesson range, inserts into templates, then swaps some with similar_wrong alternatives. Tracks wrong char positions in display text.

**Vision API fallback**: `POST /api/recognize` tries Google Cloud Vision first; if unavailable, returns the expected character with 0.5 confidence (graceful degradation).

**Environment variables**:
- `GOOGLE_APPLICATION_CREDENTIALS` — path to GCP service account JSON (for Vision API)

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
- 512Mi memory, 1 CPU, 0-3 instances
- Port 8080, unauthenticated access
- Multi-stage Dockerfile: frontend build → copy static assets into Python image
