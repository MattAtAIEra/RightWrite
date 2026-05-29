# RightWrite Dev Log

> This document records a work summary for each development phase, for review and tracking.

---

## Phase 1: Fix Handwriting Recognition Returning "?" on Cloud Run

**Date**: 2026-04-04
**Trigger**: User reported handwriting recognition always returns "?" on all devices via Cloud Run endpoint.

### Completed Items

1. **Root Cause Investigation**
   - Identified two failures in the recognition fallback chain (`backend/main.py:300-340`)
   - Vision API: `403 Cloud Vision API has not been used in project before or it is disabled`
   - Gemini: `ValueError: No API key was provided`

2. **Gemini Model Fix** (`backend/main.py:374`)
   - Changed recognition model from `gemini-3.1-flash-lite-preview` to `gemini-2.5-flash`
   - Lite model does not support image/multimodal inputs; only text generation worked with it
   - Text generation (`_generate_sentences_with_gemini`) keeps using `gemini-3.1-flash-lite-preview`

3. **Secret Manager Configuration**
   - Created `gemini-api-key` secret in GCP Secret Manager
   - Granted `Secret Manager Secret Accessor` role to Cloud Run service account `532818994163-compute@developer.gserviceaccount.com`
   - Verified `GEMINI_API_KEY` env var is properly injected after deploy

4. **Logging Improvement** (`backend/main.py:319`)
   - Added `exc_info=True` to Vision API fallback warning log

5. **Deployed** to Cloud Run revision `rightwrite-00019-9v2`

### Discoveries & Fixes

- **Symptom**: Handwriting recognition returns "?" on all devices (not iPad-specific)
- **Cause 1 (Gemini API key missing)**:
  - `cloudbuild.yaml` referenced `gemini-api-key:latest` but the secret did not exist in Secret Manager
  - Cloud Run deployed successfully but without `GEMINI_API_KEY` env var — silently missing
  - Article generation appeared to work because it has a fallback to pre-existing example sentences (`backend/main.py:179-185`), masking the Gemini failure
- **Cause 2 (Vision API disabled)**: Cloud Vision API is not enabled on GCP project `532818994163`
- **Fix**: Created the secret, granted IAM permissions, redeployed
- **Lesson**:
  - **When `--set-secrets` references a non-existent secret, Cloud Run may deploy without the env var instead of failing loudly. Always verify secrets exist before deploying.**
  - **Debugging checklist for "all recognition methods failed"**: (1) Check `gcloud run services describe` for actual env vars, (2) Check `gcloud secrets list` for secret existence, (3) Check Cloud Run logs (`gcloud logging read`) for the actual exception — don't guess from code alone.
  - **Fallback code can mask upstream failures.** The article generation fallback made it seem like Gemini was working when it wasn't. When diagnosing, test the specific failing feature, not a related one.

### Test Results

- Cloud Build: SUCCESS
- Deployment: SUCCESS (revision `rightwrite-00019-9v2`, 100% traffic)
- `GEMINI_API_KEY` injection: verified via `gcloud run services describe`

---

## Phase 2: Download All Vocabulary Excel Files from pedia.cloud.edu.tw

**Date**: 2026-04-04
**Trigger**: User requested downloading vocabulary Excel files for all grades and publishers.

### Completed Items

1. **URL Pattern Research**
   - Decoded TextNameId format: `01{publisher:02d}{grade:02d}{year:03d}{semester:02d}{lesson:02d}`
   - Publisher codes: `01`=翰林版, `02`=南一版, `03`=康軒版
   - Download mechanism: POST to `/Bookmark/ExportExcel` with CSRF token and `isAllWords=true`

2. **Download Script** (`scripts/download_vocab_excel.py`)
   - Fetches lesson IDs from Textword listing pages
   - Downloads Excel via curl subprocess (bypasses SSL cert issue with Python requests)
   - Skips existing files, validates Excel format via PK zip header

3. **Downloaded 213 Excel files** into `resource/` directory
   - 18 directories: 3 publishers x 6 grades (e.g., `一下-康軒版`, `四下-南一版`)
   - Grades 1-5: 12 lessons each; Grade 6: 9 lessons each
   - Naming convention: `{lesson_name}.xlsx` (e.g., `第一課：一束鮮花.xlsx`)

### Discoveries & Fixes

- **Symptom**: Python `requests` library fails with `SSLCertVerificationError: Missing Subject Key Identifier`
- **Cause**: Government education website (`pedia.cloud.edu.tw`) has a non-standard SSL certificate missing the Subject Key Identifier extension. macOS system curl uses SecureTransport and accepts it; Python's urllib3/requests uses its own stricter cert bundle.
- **Fix**: Rewrote HTTP calls to use curl subprocess instead of Python requests
- **Lesson**: For Taiwan government/education websites, prefer curl over Python requests for SSL compatibility.

### Test Results

- Download: 213/213 files successful, 0 failures
- All files validated as Excel format (PK zip header)

---

## Phase 3: Multi-Grade Support, Async Recognition, UI Improvements

**Date**: 2026-04-04
**Trigger**: User requested supporting all grades/publishers from downloaded Excel files, and improving handwriting recognition UX.

### Completed Items

1. **Excel Parser & Vocab Data Generation** (`scripts/build_vocab_json.py`)
   - Parses 213 Excel files from `resource/` into `backend/vocab_all.json`
   - 3570 characters across 18 grade/publisher combinations (1-6年級 x 康軒/南一/翰林)
   - 98% have `similar_wrong` lists: 400 manually curated entries preserved, rest generated via pypinyin homophones
   - Title extraction fixed: falls back to filename when Excel row 1 is empty
   - Curated data saved separately in `scripts/curated_similar_wrong.json` for reproducibility

2. **Backend Rewrite** (`backend/vocab_data.py`)
   - Loads from `vocab_all.json` instead of hardcoded Python dicts (922→95 lines)
   - Backward compatible: `grade4` → `4_kangxuan`, `grade2` → `2_hanlin` aliases
   - Same public API: `get_grade_registry()`, `get_grade_info()`, `get_vocab_data()`, etc.
   - `main.py` updated: `GRADE_REGISTRY` → `get_grade_registry()`

3. **Async Handwriting Recognition** (`frontend/src/components/ArticlePractice.tsx`)
   - Canvas dismisses immediately on submit — no more blocking await
   - Pending state with ⏳ pulse animation while recognition runs in background
   - Characters can be re-clicked to correct answers (only pending chars blocked)
   - Recognition callbacks update annotations and results asynchronously

4. **Grade/Publisher Selector Redesign** (`frontend/src/components/LessonSelector.tsx`)
   - Split from 18-button list into two compact radio groups: publisher (3) + grade (6)
   - No full-page reload on switch — content dims with opacity transition during AJAX fetch
   - Lessons sorted by `lesson_number` (was unsorted)

5. **Result View Enhancements** (`frontend/src/components/ResultView.tsx`)
   - Confetti celebration (40 particles falling animation) + "恭喜全對" banner on 100% accuracy
   - Student's handwritten image (canvas screenshot) shown instead of AI-recognized text
   - 訂正 button for wrong answers: inline practice canvas, write/clear/rewrite, no recognition needed
   - Result flow: 錯字 → 手寫圖 → 正確答案

6. **Recognition Model Changes** (`backend/main.py:374`)
   - `gemini-2.5-flash` → `gemini-3.1-flash-preview` (404) → `gemini-3-flash-preview` (correct)
   - Text generation remains `gemini-3.1-flash-lite-preview`

### Discoveries & Fixes

- **Symptom**: `gemini-3.1-flash-preview` returns 404 NOT_FOUND
- **Cause**: Model name does not exist. Correct ID is `gemini-3-flash-preview` (no ".1")
- **Fix**: Listed available models via `client.models.list()` and used correct name
- **Lesson**: **Always verify model names against `ListModels` API before deploying.** Model naming is inconsistent (3.1-flash-lite-preview exists but 3.1-flash-preview does not). Check with: `python -c "from google import genai; client = genai.Client(); [print(m.name) for m in client.models.list() if 'flash' in m.name]"`

- **Symptom**: Many lesson titles empty after Excel parsing
- **Cause**: Most Excel files have empty row 1; title is only in the filename
- **Fix**: Parser falls back to extracting title from filename when cell A1 is empty

- **Symptom**: Full page refresh when switching grade/publisher
- **Cause**: `loading` state caused early return replacing entire component with loader
- **Fix**: Separate `lessonsLoading` state; keep selectors always visible, dim content area only

### Test Results

- TypeScript: zero errors
- Frontend build: SUCCESS
- Backend smoke tests: 18 grades loaded, all API endpoints functional, backward compat verified
- Cloud Build + Deploy: SUCCESS (multiple revisions)

---

## Phase 4: Show Handwritten Image in Results & Correction Canvas

**Date**: 2026-04-04
**Trigger**: User feedback that AI recognition doesn't always match handwriting, especially for children's writing. Teachers need to see actual handwriting to assist correction.

### Completed Items

1. **Handwritten Image in Results** (`frontend/src/components/ResultView.tsx`, `ArticlePractice.tsx`)
   - Added `imageData?: string` field to `AnswerResult` interface
   - Results display student's canvas screenshot (48x48 thumbnail) instead of recognized character
   - Applied to both wrong-char results and false-alarm records

2. **Correction Practice Canvas** (`frontend/src/components/ResultView.tsx`)
   - 訂正 button appears next to every wrong answer (not missed)
   - Opens inline `CorrectionCanvas` component with grid guides
   - Students write the correct character, can clear and rewrite unlimited times
   - No API recognition — pure writing practice for teacher-guided correction
   - Toggle open/close with button text change (訂正/收起)

### Test Results

- TypeScript: zero errors
- Frontend build: SUCCESS
- Cloud Build + Deploy: SUCCESS

---

## Phase 5: Personalization — Per-Profile Tracking, Weighted Review, Dashboard

**Date**: 2026-05-23 (design) → 2026-05-28 (merged, PR #6)
**Trigger**: User requested a personalization feature — default-off, multi-profile mistake tracking stored on the iPad, weighted review of previously-wrong characters, and a learning dashboard. Cloud sync reserved as a future paid tier.

Design spec: `docs/superpowers/specs/2026-05-23-personalization-design.md`
Implementation plan: `docs/superpowers/plans/2026-05-23-personalization.md`
Executed subagent-driven, 6 phases, ~28 commits, with per-task spec + code-quality review.

### Completed Items

1. **Build setup** (`frontend/package.json`, `vite.config.ts`, `vitest.setup.ts`, `backend/requirements.txt`)
   - Added vitest + fake-indexeddb + @testing-library/* for frontend tests; pytest for backend
   - `idb` for IndexedDB; (recharts was added here then removed in Phase 6)

2. **IndexedDB storage layer** (`frontend/src/storage/`)
   - `db.ts` — 4 object stores: `profiles`, `sessions`, `charStats`, `handwritingImages` with indexes; `closeDB()` closes the live connection (needed for test isolation)
   - `profileStore.ts`, `sessionStore.ts` (`recordSession` writes session + char aggregates + images), `charStatsStore.ts` (`applyEvent` event→stat rules, `listTopMistakes`), `imageStore.ts` (TTL purge), `quota.ts` (`ensureRoomForImage`)
   - Cloud-sync hooks: every record carries `updatedAt` / `syncedAt`

3. **Personalization context + UI** (`frontend/src/personalization/`)
   - `PersonalizationContext.tsx` — default-off toggle (localStorage), active profile state
   - `ProfilePicker.tsx` — profile cards + add modal (name + 1 of 8 animal emoji)
   - `LessonSelector.tsx` — ⚙️ settings dropdown, profile bar, 📊 dashboard entry, start disabled until a profile is chosen
   - `ArticlePractice.tsx` — records a session on finish; builds `weightedChars` (filtered by current gradeId) before generating

4. **Weighted review** (`frontend/src/personalization/weights.ts`, `backend/main.py`)
   - Frontend weight = `1 + mistakeRate*3`, decayed by `0.5^streak`, floored at 1
   - Backend `GenerateArticleRequest.weighted_chars` + `_weighted_sample_without_replacement` (Efraimidis-Spirakis)

5. **Dashboard** (`frontend/src/dashboard/`)
   - `derive.ts` (pure stats helpers) + 4 widgets: StatsCards, MistakeTrendChart, LessonProgressGrid, TopMistakesList (expandable handwriting thumbnails)

6. **Storage lifecycle** (Phase 5 plan §6)
   - 4-month (120-day) TTL auto-purge of handwriting images on app mount
   - Quota warning modal (>80% warn / >95% block) shown after recording, via pending-results pattern so results still display
   - Persistent "skip images" flag + manual cleanup buttons in settings

### Discoveries & Fixes

- **Spec/test contradiction in `listTopMistakes`**: plan's impl filtered `mistakes > 0` but the test expected a 0-mistake char included. Resolved in favour of the impl (a "top mistakes" list should exclude never-wrong chars); test updated.
- **`applyEvent` wiping metadata**: a `false_alarm` event carries `lesson=0`/`word=""`; unconditional overwrite erased good metadata from a prior `found_wrong`. Added `hasFreshMeta` guard.
- **IndexedDB test flakiness**: fake-indexeddb's `deleteDatabase` deadlocks when a connection is still open. Fixed with `closeDB()` closing the live connection + per-test `new IDBFactory()` reset.

### Test Results

- Frontend: 49/49 vitest tests pass (storage, context, weights, dashboard derive)
- Backend: 10/10 pytest tests pass (weighted sampling + generate integration)
- Build: SUCCESS; no new lint errors
- Cloud Build + Deploy (PR #6 merge): SUCCESS — **but shipped a production blank screen, see Phase 6**

---

## Phase 6: Fix Production Blank Screen (recharts / es-toolkit / Rolldown)

**Date**: 2026-05-29 (merged, PR #7)
**Trigger**: After PR #6 deployed, the live Cloud Run site rendered a blank screen with console error `Uncaught TypeError: t is not a function`.

### Completed Items

1. **Replaced recharts with a hand-rolled SVG line chart** (`frontend/src/dashboard/MistakeTrendChart.tsx`, `frontend/src/index.css`)
   - Same props + window selector (近7次/近30天/全部); removed `recharts` dependency entirely
   - Bundle dropped from 569 KB → 239 KB minified (no more chunk-size warning)

### Discoveries & Fixes

- **Symptom**: Blank screen in production only (dev + tests were fine); minified error `t is not a function`, unminified `require_isUnsafeProperty is not a function`, thrown at module-eval before React mounts.
- **Root cause**: recharts 3.8.1 imports `es-toolkit/compat/*`, whose package `exports` expose **only CommonJS** for those subpaths (no ESM condition). Vite 8's **Rolldown** bundler mis-generates the CJS interop wrapper for es-toolkit's `get.js` — `var require_isUnsafeProperty = require_isUnsafeProperty()` self-references an undefined binding → calls `undefined()`. recharts is loaded at startup (static `import Dashboard`), so the whole app fails to mount.
- **Why dev passed**: dev uses esbuild pre-bundling which handles the CJS correctly; only the Rolldown production build hits the bug. `npm run build` succeeds (it's a runtime, not compile, error), so CI/build checks didn't catch it.
- **Fix**: recharts was the sole consumer of es-toolkit and added ~1.3 MB for one chart. Hand-rolled SVG removes the dependency, the bundler incompatibility, and the bloat.
- **Lesson**: **`npm run dev` does NOT reveal Rolldown CJS-interop bugs.** Verify the production build by serving it through the FastAPI backend (mirrors Cloud Run) and loading it in a browser before merging. Treat CJS-only deps with suspicion on the Vite 8 / Rolldown toolchain. (Recorded in auto-memory `project_charting_no_recharts.md`.)

### Verification

- Reproduced + verified with headless Chrome against the production build (FastAPI serving `backend/static` + `/api`): before — empty `#root` + pageerror; after — full LessonSelector renders, zero console errors
- 49 frontend + 10 backend tests still pass
- Live verification post-deploy: revision `rightwrite-00039-dtw` serving 100% traffic; live `#root` renders full UI

---

## TODO

- [ ] Enable Cloud Vision API on GCP project (currently disabled — would improve recognition as primary method)
- [ ] Investigate `gemini-3-flash-preview` recognition quality for children's handwriting
- [ ] Manual end-to-end check of personalization on the live site: create profile → practice → 📊 dashboard SVG trend chart
- [ ] Pre-existing lint debt (5 errors in `ResultView.tsx` / `LessonSelector.tsx` from before personalization) — not gating, clean up when convenient
- [ ] Optional follow-up: make `recordSession` atomic for session + charStats (single IDB transaction; images stay best-effort due to async quota check)
- [ ] Delete merged remote branches `feat/personalization` and `fix/recharts-prod-crash`
- [x] ~~Parse downloaded Excel files to extend `vocab_data.py` for other grades/publishers~~
- [x] ~~Clean up duplicate files in `resource/四下-康軒版/`~~
