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

## TODO

- [ ] Enable Cloud Vision API on GCP project (currently disabled — would improve recognition as primary method)
- [ ] Investigate `gemini-3-flash-preview` recognition quality for children's handwriting
- [x] ~~Parse downloaded Excel files to extend `vocab_data.py` for other grades/publishers~~
- [x] ~~Clean up duplicate files in `resource/四下-康軒版/`~~
