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

## 流程

1. 老師按「建立賽局」→ 伺服器產生三碼代碼（去掉易混淆的 I、L、O、0、1）與老師密鑰。
2. 畫面顯示 QR Code（網址 `https://<網域>/g/<代碼>`），學生掃碼或手動輸入代碼，填暱稱加入，最多 10 人。
   加入時會記錄 IP（反向代理後面讀 `X-Forwarded-For`）與瀏覽器資訊。
3. 老師按「開始比賽」→ 伺服器隨機挑 5 個成語，每個置換一個常見錯別字，依序出題，每題 20 秒。
4. 學生在九宮格書寫，筆跡每 40 毫秒一批透過 WebSocket 送到伺服器，再轉送給老師端即時描繪。
5. 全部送出或時間到（再給 2.5 秒緩衝讓學生端補送畫面）→ 統一辨識 → 公布答案 5 秒 → 下一題。
6. 五題結束：依「答對題數多 → 總用時短」排名，寫入 SQLite；老師可「再來一輪」（換 5 個新成語，學生不必重新加入）。

## 手寫辨識

與改錯字神器共用 `backend/recognition.py`：

- 有設定 `GOOGLE_APPLICATION_CREDENTIALS` 時用 Google Cloud Vision 辨識，與正確字比對。
- 沒有 Vision 時進入「備援模式」：只要有筆跡就算答對（信心值 0.5），空白視為答錯。
  後台的各題結果滑鼠移上去會顯示是哪一種模式。

## 環境變數

| 變數 | 預設 | 說明 |
|---|---|---|
| `YZQJ_ADMIN_TOKEN` | （空，不驗證） | 設定後，後台要輸入這組密碼才能看 |
| `YZQJ_DB_PATH` | `backend/data/yzqj.sqlite3` | 成績資料庫位置 |
| `YZQJ_QUESTION_SECONDS` | `20` | 每題秒數 |
| `YZQJ_REVEAL_SECONDS` | `5` | 公布答案停留秒數 |
| `YZQJ_GRACE_SECONDS` | `2.5` | 時間到之後等學生端補送的緩衝秒數 |

## 部署注意事項

- **賽局狀態放在記憶體**，`cloudbuild.yaml` 已把 Cloud Run 設成 `--max-instances 1`，
  並把 `--timeout` 拉到 3600 秒讓 WebSocket 不會被切斷。若要多實例，需改用 Redis 之類的共享狀態。
- Cloud Run 的檔案系統在實例重啟後會清空，成績資料庫要長期保存請把 `YZQJ_DB_PATH` 指到掛載的持久儲存空間。
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
