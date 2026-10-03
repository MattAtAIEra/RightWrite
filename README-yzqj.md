# 一字千金 — 多人即時成語改錯競賽

掃 QR Code 加入賽局，書法成語裡藏著一個錯字，20 秒內在九宮格寫出正確的字。
老師的監看畫面會即時轉播每一位學生的筆跡；一輪 5 題，結束後顯示正確率與排名。

## 網址

| 路徑 | 說明 |
|---|---|
| `/` | 國語學習樂園（入口），可進入「改錯字神器」與「一字千金」 |
| `/rightwrite` | 改錯字神器（原本的單人練習） |
| `/yzqj` | 一字千金首頁：老師建立賽局／學生輸入代碼 |
| `/yzqj/host/{code}` | 老師監看畫面（只能在建立賽局的那個瀏覽器開啟） |
| `/g/{code}` | 學生加入與作答，QR Code 指到這裡 |
| `/yzqj/admin` | 成績後台：每場賽局的參加者、IP、各題結果、排名 |
| `/yzqj/idioms` | 成語題庫：看全部成語（內建＋自訂）、新增／刪除自訂成語 |

## 流程

1. 老師按「建立賽局」→ 伺服器產生三碼代碼（去掉易混淆的 I、L、O、0、1）與老師密鑰。
2. 畫面顯示 QR Code（網址 `https://<網域>/g/<代碼>`），學生掃碼或手動輸入代碼，填暱稱加入，最多 10 人。
   加入時會記錄 IP（反向代理後面讀 `X-Forwarded-For`）與瀏覽器資訊。
3. 老師按「開始比賽」→ 伺服器隨機挑 5 個成語，每個置換一個常見錯別字，依序出題，每題 20 秒。
4. 學生在九宮格書寫，筆跡每 40 毫秒一批透過 WebSocket 送到伺服器，再轉送給老師端即時描繪。
5. 全部送出或時間到（再給 2.5 秒緩衝讓學生端補送畫面）→ 統一辨識 → 公布答案 5 秒 → 下一題。
6. 五題結束：依「答對題數多 → 總用時短」排名，寫入 SQLite；老師可「再來一輪」（換 5 個新成語，學生不必重新加入）。

## 手寫辨識

與改錯字神器共用 `backend/recognition.py`，但一字千金用的是「嚴格判定」：

1. 一次 Gemini 呼叫（`gemini-3-flash-preview`，thinking low）回三個欄位：
   - `char`：不給提示、自由辨識出的字
   - `closest`：在候選字裡最接近哪一個。候選字＝正確字＋題目的錯字＋其他成語在同一個字上用過的錯字＋生字表的形近字（`vocab_data.get_similar_wrong`）
   - `clear`：筆畫是否完整可辨（歪斜、不工整沒關係；部件缺漏、黏成一團、只能靠猜就是 false）
2. 三個都指向正確字才算對。這是為了擋「故意寫得很潦草，讓模型靠『像』就放行」：
   寫得像錯字、看不清楚、只畫半個字都不給過。
3. 每位學生的辨識最多等 `YZQJ_RECOGNIZE_TIMEOUT` 秒（預設 8），超過就算這題答錯並標示「辨識逾時」，不讓全班卡著等。
   Gemini 的 HTTP deadline 最少 10 秒，所以真正的上限是 asyncio 那層在控制。
4. Gemini 失敗時退到 Google Cloud Vision 自由辨識（需要 `GOOGLE_APPLICATION_CREDENTIALS` 或跑在 Cloud Run 上）；
   兩者都沒設定時進入「備援模式」：只要有筆跡就算答對（信心值 0.5），空白視為答錯。後台各題結果滑鼠移上去會顯示判定細節。

後台可以用 `POST /api/yzqj/admin/recognize`（body：`image_data`、`expected_char`、可選 `distractors`）丟一張圖試跑判定。

## 出題

- 題庫＝`backend/idioms_data.py` 的內建成語＋老師在 `/yzqj/idioms` 新增的自訂成語（存成 JSON，路徑 `YZQJ_IDIOMS_PATH`）。
- 最近 6 輪（跨賽局，記在 SQLite 的 `question_log`）出過的成語盡量不再出；同一場「再來一輪」絕對不重複。
  題庫不夠時才會回頭用舊的。
- 自訂成語的字不在書法字型子集裡時，瀏覽器會自動退到 LXGW WenKai TC 顯示；要讓它們也用楷體，重跑 `scripts/build_calligraphy_font.py`。

## 環境變數

| 變數 | 預設 | 說明 |
|---|---|---|
| `YZQJ_ADMIN_TOKEN` | （空，不驗證） | 設定後，成績後台與新增／刪除成語都要帶這組密碼 |
| `YZQJ_DB_PATH` | `backend/data/yzqj.sqlite3` | 成績與出題紀錄資料庫位置 |
| `YZQJ_IDIOMS_PATH` | `backend/data/custom_idioms.json` | 自訂成語 JSON（線上掛在 Cloud Storage volume 的 `/data`） |
| `YZQJ_QUESTION_SECONDS` | `18` | 每題秒數 |
| `YZQJ_REVEAL_SECONDS` | `5` | 公布答案停留秒數 |
| `YZQJ_GRACE_SECONDS` | `2.5` | 時間到之後等學生端補送的緩衝秒數 |
| `YZQJ_RECOGNIZE_TIMEOUT` | `8` | 每位學生的辨識最多等幾秒，超過算答錯 |

## 部署注意事項

- **賽局狀態放在記憶體**，`cloudbuild.yaml` 已把 Cloud Run 設成 `--max-instances 1`，
  並把 `--timeout` 拉到 3600 秒讓 WebSocket 不會被切斷。若要多實例，需改用 Redis 之類的共享狀態。
- Cloud Run 的檔案系統在實例重啟後會清空。`cloudbuild.yaml` 已把 Cloud Storage bucket `rightwrite-data-teamfollowme` 掛到 `/data`
  （gen2 執行環境），自訂成語放在那裡才不會消失。成績資料庫仍在本機磁碟（SQLite 不適合放 Cloud Storage FUSE），要長期保存得換資料庫。
- `min-instances 0` 時閒置會縮到零，進行中的賽局會消失；上課前先開一場讓實例熱起來即可。

## 書法字型

使用「文鼎 PL 中楷」（AR PL UKai TW，Arphic Public License，台灣標準字形）。
完整字型約 17MB，`scripts/build_calligraphy_font.py` 只擷取成語資料用到的字（約 500 字），
輸出 `frontend/public/fonts/ARPLUKaiTW-yzqj.woff2`（約 320KB）。授權全文在同目錄的 `ARPHICPL.TXT`。

新增成語到 `backend/idioms_data.py` 之後，執行：

```bash
pip install fonttools brotli
python scripts/build_calligraphy_font.py   # 會自動下載字型來源
```

## 測試

```bash
cd backend && python -m pytest tests -q
```

`tests/test_yzqj.py` 用 TestClient 模擬老師與兩位學生跑完整場：建立、加入、IP 記錄、密鑰驗證、
筆跡轉播、送出、時間到補送、五題、排名、後台查詢、人數上限、開始後不可加入、手動跳題。
