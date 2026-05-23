# RightWrite 個人化功能設計

**Date**: 2026-05-23
**Status**: Approved by user, ready for implementation plan
**Branch**: `feat/personalization`

## 1. 目標與範圍

為 RightWrite 加入「個人化錯字追蹤與複習」功能，讓家長能讓家中多位小朋友共用同一台 iPad，各自累積錯字紀錄、看到學習儀表板、並在後續練習時自動加強曾經寫錯的字。

**核心原則**:

- 預設關閉。使用者主動於設定中開啟個人化才會寫入任何本機紀錄。
- 所有紀錄存於 iPad 瀏覽器本機（IndexedDB）。上雲跨裝置為未來付費功能，目前僅留鉤。
- 一台 iPad 可建立多個 profile（兄弟姊妹共用），紀錄分人。

**非目標**:

- 不做密碼 / 鎖定機制（家中共用情境，profile 純標籤識別）。
- 不做 SRS 間隔重複（保留為未來迭代，目前用加權隨機抽即可）。
- 不做雲端同步（僅留資料結構鉤）。

## 2. 整體流程與 UI 入口

App 新增第 4 個 stage：`dashboard`。整體流程：

```
select ─┬─ practice ── result
        └─ dashboard  ← 新增
```

**首頁 LessonSelector 變更**:

- 右上角新增齒輪 ⚙️ 設定按鈕，下拉顯示：
  - 「個人化記錄」toggle
  - 「清理 4 個月前資料」按鈕（僅在 toggle 開啟時可見）
- 個人化開啟時，標題列下方出現 profile 卡片列：`[👦 小明] [👧 小華] [➕ 新增]` 與 `[📊 報表]` 入口。
- 個人化開啟、但尚未選擇 profile：跳出 modal「請選擇或新增小朋友」。

**模式語意**:

| 個人化 toggle | 已選 profile | 行為                                                              |
| ------------- | ------------ | ----------------------------------------------------------------- |
| 關閉          | N/A          | 完全不寫 storage，無 dashboard / profile selector（隱私模式）。   |
| 開啟          | 未選         | 提示選 / 建 profile。練習流程暫停可用。                           |
| 開啟          | 已選         | 練習自動帶 `weighted_chars`、結束自動寫入紀錄，dashboard 可進入。 |

**Profile 識別**: 名字（家長輸入，最多 6 字） + emoji（從固定 8 個動物中選 1：🐶 🐱 🐰 🐻 🦊 🐼 🐨 🐯）。無密碼。

## 3. 資料模型（IndexedDB schema）

DB name: `rightwrite-personalization`，version 1。共 4 個 object store。

### 3.1 `profiles`

```ts
{
  id: string;          // uuid v4, PK
  name: string;        // 1-6 字
  emoji: string;       // 從固定 8 個動物 emoji 選
  createdAt: number;   // unix ms
  lastActiveAt: number;
  updatedAt: number;   // 為雲同步預留
  syncedAt: number | null;  // 為雲同步預留
}
```

### 3.2 `sessions`（練習流水帳）

```ts
{
  id: string;          // uuid, PK
  profileId: string;   // idx
  gradeId: string;     // idx, e.g. "4_kangxuan"
  gradeLabel: string;  // 顯示用
  startLesson: number;
  endLesson: number;
  mode: "article" | "sentence";
  startedAt: number;   // idx, unix ms
  finishedAt: number;
  events: AnswerResult[];  // 含每個錯字事件，與既有型別一致 + 補 gradeId/word
  summary: {
    totalWrong: number;     // 文章中刻意放的錯字數
    foundCorrect: number;   // 找到且寫對
    falseAlarms: number;    // 誤判正確字為錯字
    missed: number;         // 漏看
    accuracy: number;       // foundCorrect / (totalWrong + falseAlarms)
  };
  updatedAt: number;
  syncedAt: number | null;
}
```

### 3.3 `charStats`（字級聚合）

```ts
{
  // compound PK: [profileId, gradeId, char]
  profileId: string;
  gradeId: string;
  char: string;        // 該字的正確版本
  lesson: number;      // 最近一次出現所屬課
  lessonTitle: string; // 最近一次出現所屬課的標題
  word: string;        // 最近一次出現所在的詞語
  attempts: number;    // 該字出現在該 profile 練習中的總次數
  mistakes: number;    // 答錯次數（定義見下表）
  lastSeenAt: number;
  lastMistakeAt: number | null;
  recentSuccessStreak: number;  // 連續答對次數
  mistakeRate: number; // idx for Top N query, = mistakes / attempts
  updatedAt: number;
  syncedAt: number | null;
}
```

索引：

- `byProfile`：`profileId`
- `byMistakeRate`：`[profileId, mistakeRate]`（Top N 查詢）

**事件對 `charStats` 的更新規則**（核心 invariant，所有實作須遵守）:

| 事件類型 (`AnswerResult.type`) | 鎖定的 `char` (charStats key) | `attempts` | `mistakes`   | `recentSuccessStreak` |
| ------------------------------ | ----------------------------- | ---------- | ------------ | --------------------- |
| `found_wrong` (寫對)           | `correctChar`                 | +1         | 不變         | +1                    |
| `found_wrong` (寫錯)           | `correctChar`                 | +1         | +1           | 歸 0                  |
| `false_alarm`                  | `correctChar` (即使用者點到的正確字) | +1     | +1           | 歸 0                  |
| `missed` (漏看)                | `correctChar`                 | +1         | +1           | 歸 0                  |

注意：

- `false_alarm` 鎖定的是「使用者誤判為錯字的正確字」，不是使用者畫上去的任意字。
- `lesson` / `lessonTitle` / `word` 每次都用該事件的值覆寫（採「最近一次出現」語意），方便 dashboard 顯示時呈現相對新的脈絡。
- `mistakeRate` 在每次更新後同步重算。

### 3.4 `handwritingImages`（手寫圖，4 個月 TTL）

```ts
{
  id: string;          // uuid, PK
  profileId: string;   // idx
  sessionId: string;
  char: string;
  capturedAt: number;  // idx for TTL purge
  imageData: string;   // base64 PNG
}
```

### 3.5 雙寫一致性

`recordSession(profileId, session)` 在單一 transaction 內同時寫 `sessions` / `charStats` / `handwritingImages` 三個 store，失敗整個 rollback。`charStats` 是冪等更新：取目前值 → 計算新值 → put 回去。

## 4. 加權邏輯

### 4.1 前端 weight 計算

```ts
// src/personalization/weights.ts
function buildWeightedChars(stats: CharStat[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const s of stats) {
    if (s.attempts === 0) continue;
    const mistakeRate = s.mistakes / s.attempts;
    // 練過且最近答對 ≥ 2 次 → 不送（沿用標準權重 1）
    if (mistakeRate === 0 && s.recentSuccessStreak >= 2) continue;
    const boost = 1 + mistakeRate * 3;
    const decay = Math.pow(0.5, s.recentSuccessStreak);
    result[s.char] = Math.max(1, boost * decay);
  }
  return result;
}
```

直觀解讀：

| 狀態                       | weight |
| -------------------------- | ------ |
| 從沒練過的字（不在 map）   | 1      |
| 練過全對 + streak ≥ 2      | 1      |
| 練過、錯一半               | 2.5    |
| 練過、全錯                 | 4      |
| 全錯但最近答對 2 次後      | 1      |

### 4.2 Backend 改造

`backend/main.py` `GenerateArticleRequest` 加 optional 欄位：

```python
class GenerateArticleRequest(BaseModel):
    start_lesson: int
    end_lesson: int
    mode: str = "article"
    grade_id: str = "grade4"
    weighted_chars: dict[str, float] | None = None  # NEW
```

`generate_article_with_errors()` 抽 compound 時：

```python
if weighted_chars:
    weights = [
        max((weighted_chars.get(ch, 1.0) for _, ch in comp["_swappable"]), default=1.0)
        for comp in usable
    ]
    selected = _weighted_sample_without_replacement(usable, weights, num_wrong)
else:
    selected = random.sample(usable, num_wrong)
```

`_weighted_sample_without_replacement` 用 Efraimidis-Spirakis（每個元素 key = `random()**(1/weight)`，取 top-N）。

### 4.3 為何傳 weight map 而非字 list

傳 weight map 既保留隨機性、又自然涵蓋「新字」的學習（新字權重 1，仍有機會被抽中），比硬性過濾更柔順，對國小生 UX 較好。

## 5. Dashboard 內容

```
┌──────────────────────────────────────────────┐
│ 👦 小明的學習紀錄          [切換 profile] [← 返回] │
├──────────────────────────────────────────────┤
│ § 整體統計卡片                                 │
│ ┌──────┬──────┬──────┬──────┐                 │
│ │ 47   │ 238  │ 12   │ 85%  │                 │
│ │練習次數│寫對字數│連續天數│平均正確率│                │
│ └──────┴──────┴──────┴──────┘                 │
├──────────────────────────────────────────────┤
│ § 錯字比例趨勢圖    ▾ [近 7 次 / 近 30 天 / 全部]│
│   折線圖：x = session 時間, y = 正確率 %        │
├──────────────────────────────────────────────┤
│ § 已做課文卡片牆                                │
│   每張卡片：(grade, lesson) → 練幾次 / 平均正確率│
├──────────────────────────────────────────────┤
│ § Top 10 最常寫錯的字                          │
│   字 / 錯誤次數 / 練習次數 / 所屬課文 / [▼ 展開]  │
│   展開：歷史手寫圖 thumbnail（若還未 TTL 清除）  │
└──────────────────────────────────────────────┘
```

**資料來源**:

| 區塊         | 來源                                                       |
| ------------ | ---------------------------------------------------------- |
| 整體統計     | `sessions` 撈該 profile 全部 sessions，現算                |
| 趨勢圖       | 每個 session 一個點（x=startedAt, y=summary.accuracy）     |
| 已做課文牆   | `sessions` group by (gradeId, lesson)，每組平均正確率      |
| Top N 錯字   | `charStats` 按 `mistakeRate` index DESC，取前 10           |

**圖表套件**: `recharts`（~90KB gz），避免自己手寫 SVG axis 邏輯。

## 6. Quota 管理與資料生命週期

### 6.1 寫入前檢查

```ts
async function ensureRoomForImage(estimatedBytes: number): Promise<"ok" | "warn" | "block"> {
  const { quota, usage } = await navigator.storage.estimate();
  const used = (usage ?? 0) + estimatedBytes;
  const pct = used / (quota ?? 1);
  if (pct > 0.95) return "block"; // 直接放棄寫圖，仍寫 metadata
  if (pct > 0.8) return "warn";   // 跳 modal
  return "ok";
}
```

### 6.2 TTL 自動清理

- App 啟動時呼叫 `purgeExpiredImages()`：`capturedAt < now - 120 天` 的 `handwritingImages` 全刪。
- 只刪手寫圖；`sessions` / `charStats` 永久保留（統計來源，且體積小）。
- 「⚙️ 清理 4 個月前資料」按鈕即手動觸發此 purge。

### 6.3 Quota 警告 modal

```
⚠️ iPad 上儲存空間快滿了
小明的個人化紀錄已佔用 4.2 MB / 5 MB

  [清掉 4 個月前的資料 → 釋出 1.8 MB]
  [先別清，繼續用（不再儲手寫圖）]
```

「不再儲手寫圖」狀態存在 `localStorage`，使用者下次啟動 app 自動回復為正常寫入。

## 7. 模組拆分

### 7.1 新增檔案（11 個）

```
frontend/src/
├── storage/
│   ├── db.ts                 # IndexedDB connection (idb package) + schema migration
│   ├── profileStore.ts       # profile CRUD
│   ├── sessionStore.ts       # recordSession (single transaction)
│   ├── charStatsStore.ts     # 寫入時更新 + 加權查詢
│   ├── imageStore.ts         # base64 圖 + TTL purge
│   └── quota.ts              # quota check
├── personalization/
│   ├── PersonalizationContext.tsx  # toggle + activeProfile state
│   ├── ProfilePicker.tsx     # 卡片列 + 新增/刪除
│   └── weights.ts            # buildWeightedChars()
└── dashboard/
    ├── Dashboard.tsx         # 主 layout
    ├── StatsCards.tsx
    ├── MistakeTrendChart.tsx # recharts
    ├── LessonProgressGrid.tsx
    └── TopMistakesList.tsx
```

### 7.2 修改檔案（6 個）

- `App.tsx`：新增 `dashboard` stage，外包 `PersonalizationProvider`
- `LessonSelector.tsx`：⚙️ toggle、profile picker、📊 dashboard 入口
- `ArticlePractice.tsx`：結束時呼叫 `recordSession`；`AnswerResult` 加 `gradeId`、`word`
- `api.ts`：`generateArticle` 加 `weightedChars?` 參數
- `types.ts`：補 `AnswerResult` 欄位 + 新型別 `Profile / Session / CharStat`
- `backend/main.py`：`GenerateArticleRequest` 加 `weighted_chars`、補 `_weighted_sample_without_replacement`

### 7.3 新依賴

- `idb` (~6KB gz)：IndexedDB Promise wrapper
- `recharts` (~90KB gz)：圖表

## 8. 測試策略

**單元測試**（vitest + fake-indexeddb）:

- `weights.ts`：給定 charStats 表 → assert weight map 符合公式
- `charStatsStore`：模擬事件 → assert 聚合更新（attempts/mistakes/streak）
- `_weighted_sample_without_replacement` (pytest)：assert 抽樣頻次大致符合權重比例（容忍 σ）

**整合測試**:

- 完整 session → `recordSession` → dashboard 查詢結果一致
- quota 接近滿時，照常寫 metadata、跳過 imageData

**手動測試**（在 iPad / 桌面瀏覽器實機）:

- 個人化開關開 / 關切換
- 多 profile 隔離（A 的紀錄不汙染 B）
- TTL purge：偽造 130 天前資料 → 啟動 app → 確認刪除
- Quota 滿時 modal 顯示與行為

## 9. 分階段交付

| Phase | 範圍                                                              | 可獨立 PR |
| ----- | ----------------------------------------------------------------- | --------- |
| 1     | Storage 基礎：`db.ts` + 4 個 store + 單元測試                     | ✅        |
| 2     | Personalization Context + Profile UI；practice 完寫紀錄，無 dashboard | ✅    |
| 3     | Backend `weighted_chars` + 前端送 weights                          | ✅        |
| 4     | Dashboard（4 區塊 + recharts）                                    | ✅        |
| 5     | Quota / TTL：警告 modal、啟動 purge、清理按鈕                     | ✅        |

每個 phase 完成後可獨立部署，使用者體驗逐步增強，不會有「半完成」狀態。

## 10. 未來雲同步留鉤

- 所有 IndexedDB record 帶 `id (uuid)`、`updatedAt`、`syncedAt = null`。
- 升級付費版時：
  1. 後端新增 `/api/sync/push` 與 `/api/sync/pull` endpoint
  2. 前端在 active profile 變更時批次推送 `updatedAt > syncedAt` 的記錄
  3. 拉取後端記錄按 `updatedAt` last-write-wins 合併

本次實作只負責埋欄位、不實作同步邏輯。
