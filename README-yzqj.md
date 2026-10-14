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
| `/backstage-admin/results` | 成績後台（要登入，只開放名單內 IP）：每場賽局的參加者、IP、各題結果、排名 |
| `/backstage-admin/idioms` | 成語題庫（要登入，只開放名單內 IP）：看全部成語（內建＋自訂）、依難度篩選、調整每個成語的難度（一般常用／進階／不出題）、新增／刪除自訂成語 |
| `/backstage-admin/usage` | 使用量儀錶板（要登入，只開放名單內 IP）：每天的辨識次數、session 數、額度與 bot 擋下次數 |

## 流程

1. 老師按「建立賽局」→ 伺服器產生三碼代碼（去掉易混淆的 I、L、O、0、1）與老師密鑰。
2. 畫面顯示 QR Code（網址 `https://<網域>/g/<代碼>`），學生掃碼或手動輸入代碼，填暱稱加入，最多 10 人。
   加入時會記錄 IP（反向代理後面讀 `X-Forwarded-For`）與瀏覽器資訊。
3. 老師選難度（一般常用／進階）後按「開始比賽」→ 伺服器從這個難度隨機挑 5 個成語，每個置換一個常見錯別字，依序出題，每題 20 秒。
4. 學生在九宮格書寫，筆跡每 40 毫秒一批透過 WebSocket 送到伺服器，再轉送給老師端即時描繪。
5. 全部送出或時間到（再給 2.5 秒緩衝讓學生端補送畫面）→ 統一辨識 → 公布答案 5 秒 → 下一題。
6. 五題結束：依「答對題數多 → 總用時短」排名，寫入 SQLite；老師可換難度再「再來一輪」（換 5 個新成語，學生不必重新加入）。

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

管理員可以用 `POST /api/yzqj/admin/recognize`（登入後，或 header `X-Admin-Token` 帶管理密碼）（body：`image_data`、`expected_char`、可選 `distractors`）丟一張圖試跑判定。

## 出題

- 題庫＝內建成語 `backend/idiom_bank.json`＋老師在管理介面新增的自訂成語（存成 JSON，路徑 `YZQJ_IDIOMS_PATH`）。
- 內建成語是教育部《成語典》（`doc/dict_idioms_2020_20260929.xlsx`）的四字主條成語 1,642 個，加上本專案原本就有的 38 個，共 1,680 個。
  解釋照錄《成語典》「用法說明-語義說明」的第一個義項（原本就有的 142 個沿用自己寫的白話解釋）。
  《成語典》採「創用CC 姓名標示-禁止改作 3.0 臺灣」授權：可以重製散布，但要標示出處、不能修改原文，
  所以解釋只截取義項、不改字，出處標在一字千金首頁頁尾與成語題庫頁。
- 每個成語有難度：`common` 一般常用（國小課本與生活常見）、`advanced` 進階（國中以上、典故較深）、`hidden` 不出題
  （內容不適合國小課堂，例如牽涉情色或血腥）。難度與錯字由 AI 分批判斷，參考兩個訊號：成語是否出現在專案收錄的國小課本、
  字是否在國小課本生字裡；錯字優先用《成語典》「形音辨誤」明寫「不可寫作」的字，其次是同音形近字，
  而且替換後不能是《成語典》收錄的可接受寫法。產生方式見 `scripts/build_idiom_bank.py`。
- 老師在管理介面調整的難度存在自訂成語同一個資料夾的 `idiom_levels.json`（線上是 `/data`），重新產生 `idiom_bank.json` 不會蓋掉。
- 出題只從老師選的難度挑；那個難度的成語不夠一輪時（例如被設成不出題太多），用另一個難度補，`hidden` 永遠不出。
- 最近 6 輪（跨賽局，記在 SQLite 的 `question_log`）出過的成語盡量不再出；同一場「再來一輪」絕對不重複。
  題庫不夠時才會回頭用舊的。
- 自訂成語的字不在書法字型子集裡時，瀏覽器會自動退到 LXGW WenKai TC 顯示；要讓它們也用楷體，重跑 `scripts/build_calligraphy_font.py`。

## 環境變數

| 變數 | 預設 | 說明 |
|---|---|---|
| `ADMIN_EMAIL`、`ADMIN_PASSWORD` | （沒設就全部拒絕） | 管理介面 `/backstage-admin` 的帳號密碼；密碼放 Secret Manager `rightwrite-admin-password` |
| `ADMIN_ALLOWED_IPS` | （空，不限制） | 逗號分隔的 IP 名單；線上設 `114.32.41.156`，名單外的 IP 連管理頁面都是 404。換了網路要改這個值再重新部署 |
| `YZ_DAILY_LIMIT` | `50` | 每個瀏覽器 session 一天最多幾次辨識，超過該題算錯並顯示「今日使用已經達到免費額度的上限」 |
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
完整字型約 17MB，`scripts/build_calligraphy_font.py` 只擷取成語資料用到的字，拆成兩個檔：

| 檔案 | 內容 | 大小 |
|---|---|---|
| `ARPLUKaiTW-yzqj.woff2` | 一般常用成語（含錯字）與介面文字用到的 1,653 字 | 約 1.1MB |
| `ARPLUKaiTW-yzqj-ext.woff2` | 其餘只有進階或不出題成語用到的 574 字 | 約 420KB |

兩個 `@font-face` 寫在產生出來的 `frontend/src/yzqj/calligraphy-font.css`，用 `unicode-range` 標明各自涵蓋哪些字，
瀏覽器遇到補充檔裡的字才下載它。只有一字千金的頁面會預先下載（`main.tsx`），首頁與改錯字神器不下載。
授權全文在同目錄的 `ARPHICPL.TXT`。

重新產生 `idiom_bank.json` 或新增自訂成語之後，執行：

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
