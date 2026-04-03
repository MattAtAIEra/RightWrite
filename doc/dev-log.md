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

## TODO

- [ ] Enable Cloud Vision API on GCP project (currently disabled — would improve recognition as primary method)
- [ ] Verify handwriting recognition works end-to-end on iPad after Gemini API key fix
- [ ] Clean up duplicate files in `resource/四下-康軒版/` (has 18 files including old duplicates with "(1)" suffix)
- [ ] Parse downloaded Excel files to extend `vocab_data.py` for other grades/publishers
