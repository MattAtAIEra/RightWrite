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

## Phase 7: Academic Redesign — 「墨韻硃砂」Scholarly Aesthetic

**Date**: 2026-06-05
**Trigger**: User invoked `/frontend-design` on a new `new-design` branch: supply Zen Maru Gothic + LXGW WenKai TC fonts, fix the inconsistent-font problem, and redesign the UI in an academic style (學院風) — explicitly *not* cute.

Full-frontend visual redesign. No backend, API, storage, or logic changes. Class names, the 直書 `vertical-rl` layout, the zhuyin ruby rules, and the hand-rolled SVG chart structure were all preserved — only typography, colour, motion, and decorative motifs changed.

### Completed Items

1. **Typography unification** (`frontend/index.html`, `frontend/src/index.css`)
   - Removed the third font `ZCOOL KuaiLe`; the Google Fonts link now loads `Zen Maru Gothic` (400/500/700) + `LXGW WenKai TC` (400/700)
   - Two-font system via tokens: `--font-display` = Zen Maru Gothic (UI chrome, numerals, headings, labels), `--font-body` = LXGW WenKai TC (article text, characters, seals)
   - Eliminated the dashboard/personalization `font-family: inherit` (system-font) inconsistency — the root cause of the "字體不一" report
   - Favicon ✏️ emoji → inline cinnabar 「正」 seal SVG; added `theme-color`; title → `改錯字練習 · RightWrite`

2. **Design-system rewrite** (`frontend/src/index.css`, full rewrite)
   - New `:root` design tokens: rice-paper surfaces (宣紙) + fractal-noise grain overlay, ink text hierarchy (墨), and a semantic colour system — cinnabar 硃砂 (primary action / corrections), indigo 青黛 (selection / secondary), bamboo 竹綠 (success), gold 赭金 (highlight / warnings)
   - Old coral/teal/yellow aliases (`--primary` etc.) remapped onto the new palette so any stray references stay coherent
   - Refined geometry (radii 12/8/6 px, warm low shadows) and calm `ease-out` motion; removed spring/overshoot, wobble, sparkle, and floating-blob animations
   - All component sections restyled in place (selector, practice, canvas, result, dashboard, personalization, responsive)

3. **De-cuting component edits** (academic motifs replace cartoon elements)
   - `LessonSelector.tsx` — `HappyKidsIllustration` (cartoon kids) → `ScholarMark`: a brushed ensō ink ring with a cinnabar 「正」 seal stamped over it
   - `ResultView.tsx` — `getEmoji` (🏆🌟👍💪📖) → `getGradeMark` returning traditional grades 優/甲/乙/丙/丁, rendered as a 硃砂 seal (`.result-emoji`, 白文 style, stamp animation); confetti + celebration-star + accuracy-circle colours moved to the academic palette; correction canvas grid → cinnabar 米字格 + ink stroke
   - `HandwritingCanvas.tsx` — 九宮格 grid `#e0e0e0` → cinnabar `rgba(178,58,46,.22)` (authentic red practice-grid), stroke `#333` → ink `#2a241d`
   - `MistakeTrendChart.tsx` — hand-rolled SVG line/dots/labels/grid recoloured to cinnabar + ink-faint (kept the no-recharts hand-rolled structure per `project_charting_no_recharts`)

4. **Branch + auto-memory**
   - Committed to `new-design` and pushed (`origin/new-design`, upstream set); single commit `feat(design): 學院風格重新設計（墨韻硃砂）`
   - Saved auto-memory `feedback_academic_design.md` recording the pivot away from CLAUDE.md's cute aesthetic

### Discoveries & Fixes

- **Font inconsistency was three-fold**: ZCOOL KuaiLe (headings) + LXGW WenKai TC (body) + system fonts (`inherit`) in the dashboard/personalization code added during Phase 5. The dashboard panels also used generic styling (`#fff` cards, `#888` grey, `rgba(0,0,0,.05)` shadows) with no shared design language — fixed by a single token-driven card chrome.
- **`.lesson-card` class collision**: used by both the selector preview and the dashboard progress grid with different children. Gave it a shared neutral base and scoped the context-specific bits under `.lesson-preview .lesson-card` / `.lesson-progress-grid` to avoid one overriding the other.
- **Recognition safety**: kept the handwriting canvas *background* white (max contrast for the Vision/Gemini OCR pipeline) and only recoloured the guide grid + stroke — the cinnabar guides mimic a real 米字格 practice sheet without risking recognition.
- **CLAUDE.md is now stale**: its "Frontend Aesthetics" section still mandates ZCOOL KuaiLe, cute shapes, confetti, and bouncy motion — all of which this phase intentionally reverses. Flagged for update (see TODO).
- **Pre-existing lint debt unchanged**: the 5 lint errors (`Math.random` in confetti, setState-in-effect, unused vars) live on lines this phase did not touch; no new lint errors were introduced.

### Test Results

- Build: SUCCESS (`tsc -b && vite build`; CSS 35 KB / gzip 6.7 KB, JS 238 KB)
- Visual verification: headless Chrome (Playwright) screenshots of all four stages (select / practice / result / dashboard) at mobile 430 px + desktop 880 px against an offline harness loading the built CSS — zero console/page errors, no font-load failures, design confirmed cohesive
- Lint: 5 errors, all pre-existing (unchanged from before this phase); 0 introduced

---

## Phase 8: 提升手寫辨識準確率（繁體約束 + Gemini 主辨識 + 簡轉繁）

**日期**：2026-06-21
**觸發**：國小使用者回報——手寫常需重寫好幾次仍辨識不出。詢問是否有以「繁體中文」角度辨識。經查兩條辨識路徑皆未約束繁體，且引擎優先序不利。

### 完成項目

1. **辨識引擎優先序對調**（`backend/main.py` `recognize_handwriting`）
   - 改為 Gemini 多模態「主辨識」、Google Vision OCR「備援」
   - 根因：舊版 Vision 先跑且幾乎總會回傳某字（即使錯），較弱的 OCR 承擔了多數辨識，較強的 Gemini 只在 Vision 完全無輸出時才備援
   - 訂正：舊 TODO 稱「Vision API 停用」已過時——`vision.googleapis.com` 實際已啟用，故對調為真實品質改動而非 no-op

2. **Gemini prompt 繁體約束 + 手寫情境**（`_recognize_with_gemini`）
   - 明確要求「以繁體中文（台灣教育部標準字形）辨識並輸出繁體字，絕不輸出簡體」
   - 補上「國小四年級手寫、筆畫不工整、比例不一、線條歪斜」情境以增加容錯
   - 回傳改用 `_first_cjk()` 容錯解析（取首個 CJK，容許多餘空白/標點）

3. **Vision 路徑強化**（`_recognize_with_vision_api`）
   - `text_detection` → `document_text_detection`（手寫導向偵測）
   - 加 `language_hints=["zh-Hant", "zh-TW"]`
   - `_first_cjk()` 過濾米字格雜訊，只取首個 CJK

4. **簡轉繁正規化保險**
   - 新增 `_normalize_to_traditional()`（OpenCC `s2tw`），套用於兩條路徑輸出
   - `backend/requirements.txt` 加入 `opencc-python-reimplemented>=0.1.7`
   - 避免引擎回傳簡體（学/过/为）被嚴格 `==` 比對誤判為錯字

### 發現與修正

- **問題**：初次「驗證」用 PIL 乾淨印刷字體（無米字格、無歪斜），全中但不能證明手寫改善，被使用者當場識破。
- **原因**：測試輸入與真實畫布輸出差距過大。真實輸入為 `HandwritingCanvas.tsx`：白底 + 淡紅虛線米字格（`rgba(178,58,46,0.22)`，中線十字+對角線）+ 黑筆觸（`#2a241d`, lineWidth 4）→ `toDataURL("image/png")`。
- **修正**：改用「米字格 + 台灣標楷體 TW-Kai + 旋轉/錯切/波形扭曲」的合成圖，並直接打 **live production endpoint** 驗證。
- **教訓**：辨識類改動須用接近真實輸入驗證，且以部署後 endpoint 為準（`conf=0.85`=Gemini 路徑、`0.9`=Vision 路徑）。本機無 Vision ADC（`DefaultCredentialsError`），本機 Vision 結果一律無效、不可作對照證據。合成扭曲字仍比真小孩潦草字工整，真實幅度須待實際使用確認。

### 測試結果

- 單元測試：10/10 通過（pytest）
- 模型名核對：`gemini-3-flash-preview` 存在（ListModels API）
- OpenCC `s2tw`：学→學、过→過、为→為、说→說 正確；繁體輸入維持不變
- 簡轉繁確定性展示：引擎回傳 学/过/爱/万 → 舊判定「錯」、新判定「對」（4/4 假性錯誤消除）
- **線上 production 實打**（revision `rightwrite-00041-lfg`）：合成扭曲圖 8/8 命中（學/過/愛/萬/葉/廣/鄉/懂），`conf=0.85` 確認走 Gemini 主路徑
- Build / 部署：成功（Cloud Run `rightwrite-00041-lfg`，asia-east1，100% 流量）

---

## Phase 9: Logo 重新設計 — 紅筆圈正字加打勾

**日期**：2026-06-21
**觸發**：使用者回報首頁 logo「很奇怪」，並指定方向——用「正」字、加打勾、紅筆圈起來。

### 完成項目

1. **品牌標記 `ScholarMark`**（`frontend/src/components/LessonSelector.tsx`）
   - 舊版：斷掉的墨色 ensō 圓環 + 偏在右下的硃砂方形印章「正」——正字未被圈住、語意不清
   - 新版：墨黑「正」字置中，硃砂紅筆「圈起來 + 右側打勾」，呼應老師批改「答對」的手勢，貼合「改錯字」主題
   - 紅圈為程式生成的手繪感路徑：橢圓 + 輕微抖動（sin 疊加）+ 收筆 overshoot 自然交疊，Catmull-Rom 平滑，非死板正圓
   - 改用主題色票 `var(--ink)` / `var(--cinnabar)`（取代寫死的 hex），與全站硃砂自動一致
   - favicon（`frontend/index.html`）維持原紅方塊「正」——細節在 16px 才清晰，圈+勾會糊

### 發現與修正

- **問題**：本機以建置產物截圖時，首頁卡在「載入中…」，logo 未顯示。
- **原因**：`ScholarMark` 在 lessons/grades API 載入後才渲染；純靜態 server 無 `/api`。
- **修正**：改以本機 `uvicorn main:app` 跑真實後端再截圖，確認 logo 在實際 app 內正確渲染、CSS 變數有解析。
- **教訓**：前端視覺改動須在「資料就緒」狀態下驗證真實畫面，不能只看靜態檔；延續 Phase 8 的「以真實渲染為準」原則。

### 測試結果

- Build：成功（`tsc -b && vite build`；CSS 35.06 KB / gzip 6.73 KB、JS 238.34 KB）
- 設計驗證：headless Chrome 截圖比較三變體（圈+勾並排 / 勾鑲圈右上 / 閉合圈+並排勾），採「手繪圈+右側並排勾」
- 真實畫面驗證：本機 uvicorn + 截圖、線上 production 截圖各一，logo 皆正確渲染
- 部署：成功（Cloud Run `rightwrite-00042-r42`，asia-east1，100% 流量）

---

## Phase 10: 修正手寫畫布「清除重寫」格線與筆跡位移

**日期**：2026-06-30
**觸發**：學生回報——寫字時按下「清除重寫」，手寫區的虛線米字格底稿會位移，手寫筆跡也跟著位移（嚴重問題）。

### 完成項目

1. **手寫畫布尺寸初始化**（`frontend/src/components/HandwritingCanvas.tsx`）
   - backing store（`canvas.width/height`）改用 `clientWidth/clientHeight`（layout 尺寸）量測，取代 `getBoundingClientRect()`
   - 以 `ctx.setTransform(dpr,0,0,dpr,0,0)` 取代 `ctx.scale(dpr,dpr)`（冪等，避免重複呼叫累積縮放）
   - 抽出單一 `paintBackground(ctx,w,h)` 供初始化與清除共用，消除 init／clearCanvas 兩份會分歧的重複格線程式碼
   - `clearCanvas` 直接呼叫 `setupCanvas()`，保證清除與初始化走同一條路徑、尺寸一致

### 發現與修正

- **問題描述**：按「清除重寫」後，虛線米字格底稿位移、且之後的手寫筆跡與指標位置對不上。
- **原因**：init `useEffect`（`[]`，mount 時執行）用 `getBoundingClientRect()` 量尺寸設定 backing store，但當下 `.canvas-dialog` 正播 `popIn` 的 `scale(0.9→1)` 進場動畫（`index.css`）。`getBoundingClientRect()` 受 CSS transform 影響，回傳動畫中被縮小的視覺尺寸（約 90%），使 backing store 偏小。動畫結束後 canvas 以全尺寸顯示（瀏覽器放大偏小的 backing store），而 `clearCanvas` 又用 settled 後的全尺寸重畫格線 → 兩套尺寸不匹配 → 格線跳位；且 `getPos` 以全尺寸座標對映到偏小的 backing store → 筆跡偏移。兩症狀同源。
- **修正**：改用不受 transform 影響的 `clientWidth/clientHeight`（動畫進行中即為最終 layout 尺寸），詳見完成項目。
- **教訓**：canvas 的 backing store 尺寸量測不可用 `getBoundingClientRect()`（會被祖先的 CSS transform／進場動畫污染），應用 `clientWidth/clientHeight`；初始化與重繪務必共用同一路徑，避免尺寸來源分歧。

### 測試結果

- Root-cause 重現（真實瀏覽器）：popIn 動畫中 `getBoundingClientRect().width=360` vs `clientWidth=400`，證實量測被縮放污染
- 修正前後不變量對照：舊邏輯清除後 backing `720` ≠ 顯示需求 `800`（位移）；新邏輯 `800===800`（不位移）
- 真實 app E2E（Playwright + 本機 uvicorn）：導到練習頁 → 點字開畫布 → 畫一筆 → 按清除；不變量 `backing===clientW*dpr` 於清除前後皆成立，截圖確認格線清除前後位置完全一致、筆跡正常清除
- 線上 production 驗證：revision `rightwrite-00043-fch` E2E 不變量成立 + 截圖確認
- Build：成功（`tsc -b && vite build`）
- 部署：成功（Cloud Run `rightwrite-00043-fch`，asia-east1，100% 流量）

---

## Phase 11：設定 dropdown 定位跑位修正

**日期**：2026-07-08
**觸發**：使用者回報——點齒輪展開的「個人化記錄」設定彈窗位置不對，不在齒輪旁邊，跑位到畫面之外。

### 完成項目

1. **設定彈窗 DOM 巢狀修正**（`frontend/src/components/LessonSelector.tsx`）
   - 將 `{showSettings && <div className="settings-dropdown">…}` 從 `.settings-bar` 的**兄弟節點**改為其**子節點**，使 `.settings-bar`（`position:relative`）成為彈窗的定位包含塊
   - 彈窗為 `position:absolute`、不參與 flex 排版，移入後不影響標題列 `justify-content:space-between` 佈局

### 發現與修正

- **問題描述**：點齒輪後，`.settings-dropdown` 未出現在齒輪下方，而是掉到畫面外。
- **原因**：`index.css` 的 `.settings-dropdown` 用 `position:absolute; right:0; top:calc(100% + 6px)`，作者在「學院風重設計」(42d0fc8) 為 `.settings-bar` 加了 `position:relative`，意圖讓彈窗錨定在標題列下方。但 JSX 中彈窗是 `.settings-bar` 的兄弟節點而非子節點，`.settings-bar` 只是兄弟不是祖先，錨不到；`#root`／`.app`／`.selector-container` 皆為 `static`，於是定位包含塊退回 viewport，`top:calc(100% + 6px)` 解析成 `100vh + 6px` → 彈窗掉到畫面下方之外。
- **為何是回歸**：原始版 (b1966c5) 用固定像素 `right:16px; top:60px` 錨定 viewport，剛好落在頂端齒輪附近而「湊巧正常」；重設計改用百分比 `top` 後才暴露巢狀錯誤。
- **修正**：把彈窗移入 `.settings-bar` 內，讓既有的 `position:relative` 真正成為定位祖先，`right:0`＝標題列右緣（＝齒輪右緣）、`top:calc(100% + 6px)`＝標題列正下方，回到齒輪下方右對齊。CSS 完全未動。
- **教訓**：`position:absolute` 的百分比 `top/right` 依賴「最近的已定位**祖先**」，加了 `position:relative` 也要確認目標元素在 DOM 上真的是它的後代，兄弟關係無效。

### 測試結果

- Root-cause 追溯：git 比對確認 `top:calc(100%+6px)` 於 42d0fc8 導入、彈窗自 b1966c5 起即為 `.settings-bar` 兄弟；原始 CSS 為 `right:16px; top:60px`（viewport 錨定）
- 型別檢查：`tsc --noEmit` 通過（exit 0），JSX 標籤平衡
- 真實 app E2E（本機 vite:5173 + uvicorn:8000）：點齒輪 → 截圖確認「個人化記錄」彈窗出現在齒輪正下方、右對齊、完整在畫面內
- Build：成功（Cloud Build `52467f3c-96e2-4b9c-841e-a087e4708ee6`，多階段 Docker）
- 部署：成功（Cloud Run `rightwrite-00044-vxn`，asia-east1，100% 流量，取代 `rightwrite-00043-fch`）
- 線上 production 驗證：導到 `https://rightwrite-532818994163.asia-east1.run.app/` → 點齒輪 → 截圖確認彈窗定位正確、完整在畫面內

---

## Phase 12：115 學年度上學期生字表 ＋ 學期 radio ＋ 偏好記憶

**日期**：2026-08-20
**觸發**：使用者提供 `doc/115上114下學期生字表_大腦與語言實驗室_20260723.xlsx`（115上＋114下、三版本、1–6 年級），要求加入系統、以 radio 讓使用者選「115上學期／114下學期」（預設 115上），並記住上次的選擇（含要不要顯示注音）；有開個人化記錄的小朋友要各自記住。

### 完成項目

1. **115上 生字資料**（`resource/<年級>上-<出版社>/`、`backend/vocab_all.json`）
   - 實驗室 xlsx 只有生字／課次／同音旁字／雙字詞，沒有課名與例句；先驗證其 114下 資料與現有 pedia.cloud.edu.tw 資料逐課完全吻合，再用 `scripts/download_vocab_excel.py --year 115_1` 從 pedia 抓 115_1 逐課 Excel（課名＋詞語＋例句），共 201 檔、18 套
   - `scripts/build_vocab_json.py` 支援 `上/下` 目錄；`TERMS` 對照 `上→115_1`、`下→114_2`；metadata 新增 `term`、`term_label`、`semester`
   - **grade_id 相容**：114下 沿用 `{grade}_{pub}`（使用者 IndexedDB 的 sessions／charStats 以 gradeId 為 key，不能變）；115上 為 `115_1_{grade}_{pub}`
   - **以實驗室表為權威交叉驗證**全部 36 套：缺字補入、pedia 獨有字移除；一對一差異視同音（袪→祛、賭→睹、壼→壺、始→使、險→顯）連詞語／例句一起改寫，非同音（罩→嬤、盛→耗、澈→激、施→凡）只換生字、詞語保留
   - `similar_wrong` 優先序：curated → 實驗室「同音旁字」（常見程度 ≥3，最多 3 個）→ pypinyin 同音字補到 4 個。6968 字中 99% 有候選
2. **後端 API**（`backend/main.py`）：`/api/grades` 回傳 `term`／`term_label`／`semester`，共 36 套；`/api/lessons`、`/api/generate` 直接吃新 id
3. **學期 radio**（`frontend/src/components/LessonSelector.tsx`、`index.css`）：`學期` 區塊放在出版社之上，選項由 `/api/grades` 的 term 推導、新到舊排序；`.term-radio` 與 `.grade-btn` 同一家族（硃砂圓點＋靛藍邊框）
4. **偏好記憶**（`storage/prefsStore.ts`、`personalization/PreferencesContext.tsx`、`storage/types.ts`）
   - `Preferences = { term, publisher, gradeNum, practiceMode, showZhuyin }`，預設 `115_1／康軒版／四年級／句子改錯／不顯示注音`
   - 兩層：裝置層 `localStorage["rightwrite:prefs"]` 永遠寫入；個人化開啟且有選小朋友時同步寫 `Profile.prefs`（IndexedDB，`updateProfile` patch 擴充）。解析順序 defaults ← device ← profile；切換小朋友從 IndexedDB 重新讀（context 裡的 `activeProfile` 是選取當下快照，不會看到之後的寫入）
   - `LessonSelector` 的 學期／出版社／年級／練習模式 改為 read-through／write-through 偏好；`ArticlePractice` 的注音開關改讀寫 `prefs.showZhuyin`
   - `sanitizePrefs` 只收型別正確的欄位，壞掉的 blob 不會污染狀態
5. **下載腳本修正**（`scripts/download_vocab_excel.py`）：加 `--year`；原本 id 清單與 `<strong>第…課</strong>` 清單分開配對，遇到無課次單元（南一一上首單元「魔法文字」）會整目錄錯位一課，改為同一格內成對擷取

### 發現與修正

- **課名錯位**：重抓後 `一上-南一版/第一課：小船.xlsx` 內容其實是「魔法文字」的 日月山木水人手門；與實驗室表比對才發現。修正配對後重抓，現在 `魔法文字.xlsx` 因無 `第N課` 被 build 略過（實驗室表亦列為無課次特殊單元），其餘逐課吻合
- **114下 既有資料有 12 處單字差異**（多為異體／誤植：壼、袪、賭）：採實驗室表；同音視為同一詞改寫詞語，非同音保留舊詞語以免造出「口嬤」這種假詞
- **偏好層次的陷阱**：`PersonalizationContext.activeProfile` 是 `setActiveProfile` 當下從 IndexedDB 讀的快照，若偏好層直接依賴它會在「關掉再開個人化」時回到舊值，所以 `PreferencesProvider` 在 profileId 變化時自行 `getProfile()` 重讀
- 本機沒有 Gemini 憑證時句子退回 `他學會了X這個詞語。`，屬既有 fallback，production 不受影響

### 測試結果

- 後端：`pytest` 15 通過（新增 `tests/test_terms.py` 5 項：36 套、兩學期各 18、legacy id 仍指 114_2、`/api/grades` term 欄位、115_1 四上康軒 L1＝實驗室表「泳串般姿溜耳鷹滑遨緩陀螺轉躍煩」、115_1 generate 正常）
- 前端：`vitest` 58/58（新增 prefsStore 5 項、PreferencesContext 4 項）；`tsc -b` 通過；`eslint` 剩原本 5 個既有錯誤，無新增
- 真實 app E2E（vite:5180 + uvicorn:8000，Chrome）：清空 localStorage → 預設 115上學期、副標「康軒版 四年級 115學年度第1學期」→ 切 114下／翰林／二／短文改錯 → reload 全部保留 → 開始練習 → 顯示注音（72 個 ruby）→ reload 再進入預設即顯示（按鈕為「隱藏注音」）→ 開個人化、新增小明、切 115上 → IndexedDB `profiles[小明].prefs = {term:"115_1"}`
- Build：成功（Cloud Build `4a3f9c20-da5c-46eb-b22c-0b5fcd4842ba`，多階段 Docker）
- 部署：成功（Cloud Run `rightwrite-00045-kxv`，asia-east1，100% 流量，取代 `rightwrite-00044-vxn`）
- 線上 production 驗證：`/api/grades` 36 套（115上學期／114下學期各 18）；`/api/lessons?grade_id=115_1_4_kangxuan` → 115學年度第1學期、12 課、第1課「水陸小高手」；`/api/generate` 115_1 四上康軒 L1–6 → Gemini 造句正常（捐錢／翻山越嶺／谷底／轉身，課名「永遠的馬偕」「攀登生命的高峰」「水陸小高手」）；Chrome 開官網：無偏好時預設 115上學期、副標「康軒版 四年級 115學年度第1學期」、新 bundle `index-9laxi_Dk.js`；切 114下 → reload 仍為 114下 → 切回 115上

---

## Phase 13：辨識降本評估 ＋ 兩段式辨識路由（low thinking → 判錯前升級複核）

**日期**：2026-08-25
**觸發**：用戶要求試算月成本（3,000 人次 × 100 字辨識），並在成本／品質間找最佳化；期間依用戶要求評估本地小模型可行性

### 完成項目

1. **成本實測與試算**（scratchpad 實驗，未入 repo）
   - 實測 `gemini-3-flash-preview` 每次辨識：input 固定 1,213 tokens（影像 360/640px 同價，media_resolution 預設 high）＋ thinking 600–1,000（難字可至 2,700+）；30 萬次/月 ≈ US$1,006
   - `thinking_level="low"`：24 字同圖 A/B → 23/24 答案相同（僅「箍」由對變錯）、平均延遲 7.31s→4.15s、月估 $572
   - `media_resolution="low"` 否決（複雜字失敗、flash-lite 自信答錯）；「驗證題」提示詞框架否決（嚴格版誤殺正樣本 58–67%、寬容版漏抓形近錯字）
2. **本地小模型評估（否決，含實測）**
   - PaddleOCR `chinese_cht_PP-OCRv3_mobile_rec`：AI-FREE 真人手寫 440 張 top-1 24.3%、合成扭曲宋體 8/24（同圖 Gemini 17/24）；閘門模擬誤放 0% 但覆蓋僅 5–12.5%（≈只省 $50/月）→ 淘汰
   - AI-FREE 資料集僅資料＋教學 notebook、無成品權重；若日後走本地應訓練單字分類器而非微調 OCR 行模型
   - 實驗紀錄（重生圖＋逐輪 console log）發佈為 Artifact：https://claude.ai/code/artifact/7c7d6fd7-5159-4427-b440-3848afb21049
3. **兩段式辨識路由**（`backend/main.py`）
   - `_recognize_with_gemini(image_data_b64, thinking_level=None)`：新增 thinking_level 參數
   - `/api/recognize`：先跑 `thinking_level="low"`，結果＝預期字即回傳；不符或失敗才以預設 thinking 複核後定判；兩段皆失敗回退 Vision API（原邏輯不變）
   - 設計理由：寫對（多數流量）走便宜快路；貴的深思只花在「即將判學生寫錯」處，low 偶發誤判（箍→篩）由複核吸收

### 發現與修正

- **背景 shell 的 gcloud 活躍帳號被其他 session 切走**（gemini-marketing-deployer 無權讀 secret）→ 本機起服務時 GEMINI_API_KEY 取值失敗、全部請求落到「？」。修正：取 secret 一律加 `--account=teamfollowme-deployer@…` 明確指定。教訓：gcloud active account 是全域可變狀態，腳本不可依賴
- AI-FREE zip 檔名為 UTF-8 flag 正常的中文，但 macOS `unzip` 解不了（Illegal byte sequence）；改用 Python zipfile 直讀

### 測試結果

- 本機 E2E（uvicorn:8010，seed 固定合成圖打 `/api/recognize`）：寫對 6/6 走單次 low（2.2–7.5s、conf 0.85）；寫錯形近字 3/3 觸發升級、認出實際的字（力／候／源）並判 False；「箍」品質回收成功（low 誤認 → 升級後判對）
- Build：成功（Cloud Build，多階段 Docker）
- 部署：成功（Cloud Run `rightwrite-00046-4s8`，asia-east1，取代 `rightwrite-00045-kxv`）
- 線上 production 驗證：寫對（配 6.9s／姆 3.1s，True）；寫錯 3/3 升級判 False 並認出實際字；箍 True（1.7s）
- 成本結論：月估 US$1,006 → 約 $500–650（依升級率；正確書寫佔比越高越省），多數學生等待時間約減半

---

## TODO

- [ ] Phase 13 follow-up — 上線後以 Cloud Run log 監控「Gemini(escalated)」出現率（＝升級率），一週後回算實際月成本；若升級率異常高，檢查是否 low 模型行為飄移
- [ ] Phase 13 follow-up — `_recognize_with_gemini` 兩段呼叫目前串行，寫錯情境延遲 9–16s；若體感太慢可考慮 streaming 提示或前端進度動畫
- [ ] Open PR for the `new-design` branch (Phases 7–12) — already deployed to production as `rightwrite-00045-kxv`, but not yet merged to default branch
- [ ] Update CLAUDE.md "Frontend Aesthetics" section to match the 學院風 redesign — it still mandates ZCOOL KuaiLe, cute shapes, confetti, and bouncy motion, all reversed in Phase 7 (do this if `new-design` is adopted)
- [ ] Real-handwriting validation of Phase 8: have a child use the live site; collect screenshots of any mis-recognitions to tune against actual failure cases (synthetic distorted glyphs only prove direction, not magnitude)
- [x] ~~Investigate `gemini-3-flash-preview` recognition quality for children's handwriting~~ — addressed in Phase 8 (Gemini now primary, 繁體-constrained prompt, tolerant parsing)
- [x] ~~Enable Cloud Vision API on GCP project~~ — already enabled (`vision.googleapis.com`); the prior note was stale. Vision is now the fallback engine
- [ ] Manual end-to-end check of personalization on the live site: create profile → practice → 📊 dashboard SVG trend chart
- [ ] Pre-existing lint debt (5 errors: `ResultView.tsx` ×3, `LessonSelector.tsx` ×1 `setLessonsLoading` in effect, `ArticlePractice.tsx` ×1 unused `_drawnChar`) — not gating, clean up when convenient
- [ ] Phase 12 follow-up — 無課次特殊單元不在練習範圍：一上南一「魔法文字」18 字、一上康軒 10 字、六下翰林 35 字（實驗室表課次為空、`build_vocab_json.py` 以 `第N課` 篩檔）。若要納入，需在 build 給它們一個虛擬課次並在 UI 標示
- [ ] Phase 12 follow-up — 115上 共 3,300 餘新字的 `similar_wrong` 全由「同音旁字 ≥3 → 同音字」自動產生（`curated_similar_wrong.json` 只有 400 字、偏四下康軒），建議抽查幾課確認錯字候選合理，必要時擴充 curated
- [ ] Phase 12 follow-up — 偏好刻意未記「課次範圍」（每週變動）；若老師反映想記，`Preferences` 加 `startLesson/endLesson` 並依 `total_lessons` clamp 即可
- [ ] 下學期（115下）資料到時：`python scripts/download_vocab_excel.py --year 115_2` → `build_vocab_json.py` 的 `TERMS` 對照表加一筆（注意 114下 仍要保留 legacy id）→ 重跑 build；前端 radio 會自動多一個選項，`DEFAULT_TERM` 視需要改
- [ ] Optional follow-up: make `recordSession` atomic for session + charStats (single IDB transaction; images stay best-effort due to async quota check)
- [ ] Delete merged remote branches `feat/personalization` and `fix/recharts-prod-crash`
- [x] ~~Parse downloaded Excel files to extend `vocab_data.py` for other grades/publishers~~
- [x] ~~Clean up duplicate files in `resource/四下-康軒版/`~~
