# RightWrite Personalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-profile mistake tracking, weighted-random review, and a learning dashboard — all persisted in IndexedDB on the iPad with a 4-month TTL.

**Architecture:** Frontend keeps a per-profile IndexedDB (`rightwrite-personalization`) with `profiles / sessions / charStats / handwritingImages` stores. Each completed practice session is written in a single transaction that also updates char-level aggregates. The aggregates drive a weight map sent to the existing `/api/generate` endpoint (new optional `weighted_chars` field) for weighted-random sampling. A new `dashboard` stage reads from the same stores for stats / trend / top-mistakes / lesson-progress widgets.

**Tech Stack:** React 19 + TypeScript (frontend), FastAPI (backend), `idb` 8.x for IndexedDB Promise wrappers, `recharts` 2.x for charts, `vitest` + `fake-indexeddb` + `@testing-library/react` for frontend tests, `pytest` for backend.

**Spec:** [`docs/superpowers/specs/2026-05-23-personalization-design.md`](../specs/2026-05-23-personalization-design.md)

---

## File Structure

**Created (frontend, 14 files):**

```
frontend/src/storage/
├── types.ts                 # Profile, Session, CharStat, HandwritingImage, AnswerResult helpers
├── db.ts                    # openDB() singleton + schema migration
├── profileStore.ts          # createProfile/listProfiles/updateProfile/deleteProfile
├── imageStore.ts            # putImage/getImage/listByProfile/purgeBefore/deleteByProfile
├── charStatsStore.ts        # applyEvent/listByProfile/listTopMistakes/buildWeightedChars
├── sessionStore.ts          # recordSession (single transaction)/listByProfile/listByLesson
└── quota.ts                 # ensureRoomForImage/getEstimate

frontend/src/personalization/
├── PersonalizationContext.tsx  # React Context: enabled/activeProfile + persistence
├── ProfilePicker.tsx        # cards + add modal + delete confirm
└── weights.ts               # buildWeightedChars() from charStats list

frontend/src/dashboard/
├── Dashboard.tsx            # layout
├── StatsCards.tsx           # 4 number tiles
├── MistakeTrendChart.tsx    # recharts LineChart
├── LessonProgressGrid.tsx   # grade/lesson cards with mini accuracy bar
└── TopMistakesList.tsx      # top N chars with expandable handwriting thumbnails

frontend/vitest.setup.ts     # fake-indexeddb/auto, jest-dom
```

**Created (frontend tests, mirror src structure):**

```
frontend/src/storage/__tests__/
├── db.test.ts
├── profileStore.test.ts
├── imageStore.test.ts
├── charStatsStore.test.ts
├── sessionStore.test.ts
└── quota.test.ts

frontend/src/personalization/__tests__/
└── weights.test.ts
```

**Created (backend tests):**

```
backend/tests/
├── __init__.py
└── test_weighted_sample.py
```

**Modified:**

```
frontend/package.json          # +idb +recharts +vitest +fake-indexeddb +@testing-library/*
frontend/vite.config.ts        # +test block
frontend/tsconfig.app.json     # +types: vitest/globals
frontend/src/App.tsx           # +dashboard stage + PersonalizationProvider
frontend/src/types.ts          # AnswerResult +gradeId +word
frontend/src/api.ts            # generateArticle +weightedChars
frontend/src/components/LessonSelector.tsx   # ⚙️ + ProfilePicker + 📊 entry
frontend/src/components/ArticlePractice.tsx  # build weights / recordSession
frontend/src/index.css         # styles for new components
backend/main.py                # GenerateArticleRequest +weighted_chars; _weighted_sample helper
backend/requirements.txt       # +pytest
.gitignore                     # +.claude/
```

---

## Phase 0: Build Setup

### Task 0.1: Stop tracking `.claude/` settings

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append `.claude/` to `.gitignore`**

```diff
 .DS_Store
 ~$*
+.claude/
```

- [ ] **Step 2: Verify it's ignored**

Run: `git status --short .claude/ 2>&1 | head -5`
Expected: empty output (no `??` lines for `.claude/`)

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .claude local settings"
git push
```

### Task 0.2: Add frontend test framework + IndexedDB deps

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.setup.ts`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tsconfig.app.json`

- [ ] **Step 1: Install dev deps**

Run from `frontend/`:
```bash
npm install --save idb recharts
npm install --save-dev vitest @vitest/ui fake-indexeddb \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  jsdom @types/jsdom
```

Expected: `package.json` gains entries; no errors.

- [ ] **Step 2: Add `test` scripts to `frontend/package.json`**

In the `scripts` section, add:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 3: Create `frontend/vitest.setup.ts`**

```ts
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Update `frontend/vite.config.ts` to register vitest config**

```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../backend/static",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
});
```

- [ ] **Step 5: Add `"vitest/globals"` to `tsconfig.app.json` `compilerOptions.types`**

Open `frontend/tsconfig.app.json`; find `compilerOptions`. Add (or extend) `"types": ["vitest/globals"]`.

- [ ] **Step 6: Smoke test — create and delete a trivial test**

Create `frontend/src/__smoke__.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `cd frontend && npm run test:run -- src/__smoke__.test.ts`
Expected: `1 test passed`.

Then delete the smoke file.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.setup.ts \
        frontend/vite.config.ts frontend/tsconfig.app.json
git commit -m "build: add vitest, idb, recharts, RTL deps for personalization"
git push
```

### Task 0.3: Add backend pytest dep

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/tests/__init__.py` (empty)

- [ ] **Step 1: Append `pytest>=8.0` to `backend/requirements.txt`**

- [ ] **Step 2: Install**

Run from `backend/`:
```bash
pip install -r requirements.txt
```

- [ ] **Step 3: Create empty `backend/tests/__init__.py`**

- [ ] **Step 4: Smoke test**

```bash
cd backend && python -m pytest tests/ -q
```
Expected: `no tests ran` (no errors).

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/tests/__init__.py
git commit -m "build: add pytest dep for backend tests"
git push
```

---

## Phase 1: Storage Layer (IndexedDB)

> All store modules use a single shared DB connection from `db.ts`. Tests use `fake-indexeddb` which is auto-installed via `vitest.setup.ts`. Each test resets the DB at top of `beforeEach`.

### Task 1.1: Storage types

**Files:**
- Create: `frontend/src/storage/types.ts`

- [ ] **Step 1: Define schema types**

```ts
// src/storage/types.ts

export interface Profile {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
  lastActiveAt: number;
  updatedAt: number;
  syncedAt: number | null;
}

export interface PracticeEvent {
  type: "found_wrong" | "false_alarm" | "missed";
  wrongChar: string;
  correctChar: string;
  userAnswer: string;
  isCorrect: boolean;
  lesson: number;
  lessonTitle: string;
  word: string;
  imageData?: string;
}

export interface SessionSummary {
  totalWrong: number;
  foundCorrect: number;
  falseAlarms: number;
  missed: number;
  accuracy: number;
}

export interface Session {
  id: string;
  profileId: string;
  gradeId: string;
  gradeLabel: string;
  startLesson: number;
  endLesson: number;
  mode: "article" | "sentence";
  startedAt: number;
  finishedAt: number;
  events: PracticeEvent[];
  summary: SessionSummary;
  updatedAt: number;
  syncedAt: number | null;
}

export interface CharStat {
  profileId: string;
  gradeId: string;
  char: string;
  lesson: number;
  lessonTitle: string;
  word: string;
  attempts: number;
  mistakes: number;
  lastSeenAt: number;
  lastMistakeAt: number | null;
  recentSuccessStreak: number;
  mistakeRate: number;
  updatedAt: number;
  syncedAt: number | null;
}

export interface HandwritingImage {
  id: string;
  profileId: string;
  sessionId: string;
  char: string;
  capturedAt: number;
  imageData: string;
}

export const AVAILABLE_EMOJIS = ["🐶", "🐱", "🐰", "🐻", "🦊", "🐼", "🐨", "🐯"] as const;
```

- [ ] **Step 2: Commit (no test yet — pure types)**

```bash
git add frontend/src/storage/types.ts
git commit -m "feat(storage): define schema types"
git push
```

### Task 1.2: `db.ts` — open DB + schema migration

**Files:**
- Create: `frontend/src/storage/db.ts`
- Create: `frontend/src/storage/__tests__/db.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/storage/__tests__/db.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { getDB, DB_NAME, closeDB } from "../db";

beforeEach(async () => {
  closeDB();
  indexedDB.deleteDatabase(DB_NAME);
});

describe("getDB", () => {
  it("opens DB with all 4 stores", async () => {
    const db = await getDB();
    const names = Array.from(db.objectStoreNames).sort();
    expect(names).toEqual(["charStats", "handwritingImages", "profiles", "sessions"]);
  });

  it("sessions store has byProfile and byStartedAt indexes", async () => {
    const db = await getDB();
    const tx = db.transaction("sessions");
    const idxNames = Array.from(tx.store.indexNames).sort();
    expect(idxNames).toEqual(["byProfile", "byProfileGradeLesson", "byStartedAt"]);
  });

  it("charStats store has byProfile and byMistakeRate indexes", async () => {
    const db = await getDB();
    const tx = db.transaction("charStats");
    const idxNames = Array.from(tx.store.indexNames).sort();
    expect(idxNames).toEqual(["byMistakeRate", "byProfile"]);
  });

  it("handwritingImages store has byProfile and byCapturedAt indexes", async () => {
    const db = await getDB();
    const tx = db.transaction("handwritingImages");
    const idxNames = Array.from(tx.store.indexNames).sort();
    expect(idxNames).toEqual(["byCapturedAt", "byProfile"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/db.test.ts`
Expected: FAIL (`Cannot find module '../db'`).

- [ ] **Step 3: Implement `db.ts`**

```ts
// src/storage/db.ts
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Profile, Session, CharStat, HandwritingImage } from "./types";

export const DB_NAME = "rightwrite-personalization";
export const DB_VERSION = 1;

export interface RWDBSchema extends DBSchema {
  profiles: {
    key: string;
    value: Profile;
  };
  sessions: {
    key: string;
    value: Session;
    indexes: {
      byProfile: string;
      byStartedAt: number;
      byProfileGradeLesson: [string, string, number];
    };
  };
  charStats: {
    key: [string, string, string];
    value: CharStat;
    indexes: {
      byProfile: string;
      byMistakeRate: [string, number];
    };
  };
  handwritingImages: {
    key: string;
    value: HandwritingImage;
    indexes: {
      byProfile: string;
      byCapturedAt: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<RWDBSchema>> | null = null;

export function getDB(): Promise<IDBPDatabase<RWDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<RWDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("profiles")) {
          db.createObjectStore("profiles", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("sessions")) {
          const sessions = db.createObjectStore("sessions", { keyPath: "id" });
          sessions.createIndex("byProfile", "profileId");
          sessions.createIndex("byStartedAt", "startedAt");
          sessions.createIndex("byProfileGradeLesson", ["profileId", "gradeId", "startLesson"]);
        }
        if (!db.objectStoreNames.contains("charStats")) {
          const charStats = db.createObjectStore("charStats", {
            keyPath: ["profileId", "gradeId", "char"],
          });
          charStats.createIndex("byProfile", "profileId");
          charStats.createIndex("byMistakeRate", ["profileId", "mistakeRate"]);
        }
        if (!db.objectStoreNames.contains("handwritingImages")) {
          const images = db.createObjectStore("handwritingImages", { keyPath: "id" });
          images.createIndex("byProfile", "profileId");
          images.createIndex("byCapturedAt", "capturedAt");
        }
      },
    });
  }
  return dbPromise;
}

export function closeDB(): void {
  dbPromise = null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/db.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/storage/db.ts frontend/src/storage/__tests__/db.test.ts
git commit -m "feat(storage): open IndexedDB with all stores and indexes"
git push
```

### Task 1.3: `profileStore.ts`

**Files:**
- Create: `frontend/src/storage/profileStore.ts`
- Create: `frontend/src/storage/__tests__/profileStore.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/storage/__tests__/profileStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { DB_NAME, closeDB } from "../db";
import {
  createProfile,
  listProfiles,
  getProfile,
  updateProfile,
  deleteProfile,
  touchProfile,
} from "../profileStore";

beforeEach(async () => {
  closeDB();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe("profileStore", () => {
  it("createProfile assigns uuid and timestamps", async () => {
    const p = await createProfile({ name: "小明", emoji: "🐶" });
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.name).toBe("小明");
    expect(p.emoji).toBe("🐶");
    expect(p.createdAt).toBeGreaterThan(0);
    expect(p.lastActiveAt).toBe(p.createdAt);
    expect(p.syncedAt).toBeNull();
  });

  it("listProfiles returns insertion order by createdAt", async () => {
    const a = await createProfile({ name: "A", emoji: "🐶" });
    await new Promise((r) => setTimeout(r, 5));
    const b = await createProfile({ name: "B", emoji: "🐱" });
    const list = await listProfiles();
    expect(list.map((p) => p.id)).toEqual([a.id, b.id]);
  });

  it("updateProfile bumps updatedAt and clears syncedAt", async () => {
    const p = await createProfile({ name: "X", emoji: "🐶" });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await updateProfile(p.id, { name: "Y" });
    expect(updated.name).toBe("Y");
    expect(updated.updatedAt).toBeGreaterThan(p.updatedAt);
    expect(updated.syncedAt).toBeNull();
  });

  it("touchProfile updates lastActiveAt", async () => {
    const p = await createProfile({ name: "X", emoji: "🐶" });
    await new Promise((r) => setTimeout(r, 5));
    await touchProfile(p.id);
    const after = await getProfile(p.id);
    expect(after!.lastActiveAt).toBeGreaterThan(p.lastActiveAt);
  });

  it("deleteProfile removes it", async () => {
    const p = await createProfile({ name: "X", emoji: "🐶" });
    await deleteProfile(p.id);
    expect(await getProfile(p.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/profileStore.test.ts`
Expected: FAIL (`Cannot find module '../profileStore'`).

- [ ] **Step 3: Implement `profileStore.ts`**

```ts
// src/storage/profileStore.ts
import { getDB } from "./db";
import type { Profile } from "./types";

function uuid(): string {
  return crypto.randomUUID();
}

export async function createProfile(input: { name: string; emoji: string }): Promise<Profile> {
  const now = Date.now();
  const profile: Profile = {
    id: uuid(),
    name: input.name,
    emoji: input.emoji,
    createdAt: now,
    lastActiveAt: now,
    updatedAt: now,
    syncedAt: null,
  };
  const db = await getDB();
  await db.put("profiles", profile);
  return profile;
}

export async function getProfile(id: string): Promise<Profile | undefined> {
  const db = await getDB();
  return db.get("profiles", id);
}

export async function listProfiles(): Promise<Profile[]> {
  const db = await getDB();
  const all = await db.getAll("profiles");
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, "name" | "emoji">>,
): Promise<Profile> {
  const db = await getDB();
  const existing = await db.get("profiles", id);
  if (!existing) throw new Error(`Profile ${id} not found`);
  const next: Profile = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
    syncedAt: null,
  };
  await db.put("profiles", next);
  return next;
}

export async function touchProfile(id: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get("profiles", id);
  if (!existing) return;
  await db.put("profiles", { ...existing, lastActiveAt: Date.now() });
}

export async function deleteProfile(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("profiles", id);
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/profileStore.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/storage/profileStore.ts frontend/src/storage/__tests__/profileStore.test.ts
git commit -m "feat(storage): profile CRUD"
git push
```

### Task 1.4: `imageStore.ts`

**Files:**
- Create: `frontend/src/storage/imageStore.ts`
- Create: `frontend/src/storage/__tests__/imageStore.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/storage/__tests__/imageStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { DB_NAME, closeDB } from "../db";
import {
  putImage,
  getImage,
  listByProfile,
  purgeBefore,
  deleteByProfile,
} from "../imageStore";

beforeEach(async () => {
  closeDB();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe("imageStore", () => {
  it("putImage + getImage roundtrip", async () => {
    const img = await putImage({
      profileId: "p1",
      sessionId: "s1",
      char: "縫",
      capturedAt: 1000,
      imageData: "data:image/png;base64,XYZ",
    });
    const got = await getImage(img.id);
    expect(got).toEqual(img);
  });

  it("listByProfile returns only that profile, newest first", async () => {
    await putImage({ profileId: "p1", sessionId: "s", char: "a", capturedAt: 10, imageData: "x" });
    await putImage({ profileId: "p2", sessionId: "s", char: "b", capturedAt: 20, imageData: "x" });
    await putImage({ profileId: "p1", sessionId: "s", char: "c", capturedAt: 30, imageData: "x" });
    const list = await listByProfile("p1");
    expect(list.map((i) => i.char)).toEqual(["c", "a"]);
  });

  it("purgeBefore deletes images older than cutoff", async () => {
    await putImage({ profileId: "p1", sessionId: "s", char: "a", capturedAt: 100, imageData: "x" });
    await putImage({ profileId: "p1", sessionId: "s", char: "b", capturedAt: 200, imageData: "x" });
    await putImage({ profileId: "p1", sessionId: "s", char: "c", capturedAt: 300, imageData: "x" });
    const deleted = await purgeBefore(250);
    expect(deleted).toBe(2);
    const remaining = await listByProfile("p1");
    expect(remaining.map((i) => i.char)).toEqual(["c"]);
  });

  it("deleteByProfile removes all profile images", async () => {
    await putImage({ profileId: "p1", sessionId: "s", char: "a", capturedAt: 1, imageData: "x" });
    await putImage({ profileId: "p2", sessionId: "s", char: "b", capturedAt: 2, imageData: "x" });
    await deleteByProfile("p1");
    expect(await listByProfile("p1")).toEqual([]);
    expect((await listByProfile("p2")).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/imageStore.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `imageStore.ts`**

```ts
// src/storage/imageStore.ts
import { getDB } from "./db";
import type { HandwritingImage } from "./types";

export async function putImage(
  input: Omit<HandwritingImage, "id">,
): Promise<HandwritingImage> {
  const img: HandwritingImage = { id: crypto.randomUUID(), ...input };
  const db = await getDB();
  await db.put("handwritingImages", img);
  return img;
}

export async function getImage(id: string): Promise<HandwritingImage | undefined> {
  const db = await getDB();
  return db.get("handwritingImages", id);
}

export async function listByProfile(profileId: string): Promise<HandwritingImage[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("handwritingImages", "byProfile", profileId);
  return all.sort((a, b) => b.capturedAt - a.capturedAt);
}

export async function purgeBefore(cutoff: number): Promise<number> {
  const db = await getDB();
  const tx = db.transaction("handwritingImages", "readwrite");
  const index = tx.store.index("byCapturedAt");
  let deleted = 0;
  let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff, true));
  while (cursor) {
    await cursor.delete();
    deleted++;
    cursor = await cursor.continue();
  }
  await tx.done;
  return deleted;
}

export async function deleteByProfile(profileId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("handwritingImages", "readwrite");
  const index = tx.store.index("byProfile");
  let cursor = await index.openCursor(profileId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/imageStore.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/storage/imageStore.ts frontend/src/storage/__tests__/imageStore.test.ts
git commit -m "feat(storage): handwriting image store with TTL purge"
git push
```

### Task 1.5: `charStatsStore.ts`

**Files:**
- Create: `frontend/src/storage/charStatsStore.ts`
- Create: `frontend/src/storage/__tests__/charStatsStore.test.ts`

- [ ] **Step 1: Write failing test (split into 4 sub-suites)**

```ts
// src/storage/__tests__/charStatsStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { DB_NAME, closeDB } from "../db";
import {
  applyEvent,
  listByProfile,
  listTopMistakes,
  getStat,
} from "../charStatsStore";
import type { PracticeEvent } from "../types";

const PROFILE = "p1";
const GRADE = "4_kangxuan";

function ev(overrides: Partial<PracticeEvent> & { type: PracticeEvent["type"]; correctChar: string }): PracticeEvent {
  return {
    wrongChar: "錯",
    userAnswer: "?",
    isCorrect: overrides.type === "found_wrong" ? true : false,
    lesson: 1,
    lessonTitle: "L1",
    word: "詞語",
    ...overrides,
  } as PracticeEvent;
}

beforeEach(async () => {
  closeDB();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe("charStatsStore.applyEvent", () => {
  it("found_wrong + isCorrect=true → attempts+1, streak+1, mistakes unchanged", async () => {
    await applyEvent({
      profileId: PROFILE,
      gradeId: GRADE,
      timestamp: 1000,
      event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: true }),
    });
    const s = await getStat(PROFILE, GRADE, "縫");
    expect(s).toMatchObject({
      attempts: 1,
      mistakes: 0,
      recentSuccessStreak: 1,
      lastMistakeAt: null,
      mistakeRate: 0,
    });
  });

  it("found_wrong + isCorrect=false → attempts+1, mistakes+1, streak=0", async () => {
    await applyEvent({
      profileId: PROFILE,
      gradeId: GRADE,
      timestamp: 1000,
      event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: false }),
    });
    const s = await getStat(PROFILE, GRADE, "縫");
    expect(s).toMatchObject({
      attempts: 1,
      mistakes: 1,
      recentSuccessStreak: 0,
      lastMistakeAt: 1000,
      mistakeRate: 1,
    });
  });

  it("missed → attempts+1, mistakes+1, streak=0", async () => {
    await applyEvent({
      profileId: PROFILE,
      gradeId: GRADE,
      timestamp: 1000,
      event: ev({ type: "missed", correctChar: "縫" }),
    });
    const s = await getStat(PROFILE, GRADE, "縫");
    expect(s).toMatchObject({ attempts: 1, mistakes: 1, recentSuccessStreak: 0 });
  });

  it("false_alarm locks to correctChar, attempts+1, mistakes+1, streak=0", async () => {
    await applyEvent({
      profileId: PROFILE,
      gradeId: GRADE,
      timestamp: 1000,
      event: ev({ type: "false_alarm", correctChar: "正" }),
    });
    const s = await getStat(PROFILE, GRADE, "正");
    expect(s).toMatchObject({ attempts: 1, mistakes: 1, recentSuccessStreak: 0 });
  });

  it("streak resets after a mistake, climbs again after successes", async () => {
    const e = (correct: boolean) =>
      applyEvent({
        profileId: PROFILE,
        gradeId: GRADE,
        timestamp: Date.now(),
        event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: correct }),
      });
    await e(true);
    await e(true);
    await e(false);
    await e(true);
    const s = await getStat(PROFILE, GRADE, "縫");
    expect(s).toMatchObject({ attempts: 4, mistakes: 1, recentSuccessStreak: 1 });
  });

  it("overwrites lesson/lessonTitle/word with latest values", async () => {
    await applyEvent({
      profileId: PROFILE, gradeId: GRADE, timestamp: 1,
      event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: true, lesson: 1, lessonTitle: "L1", word: "縫補" }),
    });
    await applyEvent({
      profileId: PROFILE, gradeId: GRADE, timestamp: 2,
      event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: true, lesson: 5, lessonTitle: "L5", word: "裁縫" }),
    });
    const s = await getStat(PROFILE, GRADE, "縫");
    expect(s).toMatchObject({ lesson: 5, lessonTitle: "L5", word: "裁縫" });
  });
});

describe("charStatsStore queries", () => {
  it("listByProfile returns only that profile", async () => {
    await applyEvent({ profileId: "p1", gradeId: GRADE, timestamp: 1,
      event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: false }) });
    await applyEvent({ profileId: "p2", gradeId: GRADE, timestamp: 1,
      event: ev({ type: "found_wrong", correctChar: "駿", isCorrect: false }) });
    const list = await listByProfile("p1");
    expect(list.map((s) => s.char)).toEqual(["縫"]);
  });

  it("listTopMistakes returns mistakeRate DESC limited to N", async () => {
    // 縫 1/2 = 0.5
    await applyEvent({ profileId: PROFILE, gradeId: GRADE, timestamp: 1,
      event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: true }) });
    await applyEvent({ profileId: PROFILE, gradeId: GRADE, timestamp: 2,
      event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: false }) });
    // 駿 1/1 = 1.0
    await applyEvent({ profileId: PROFILE, gradeId: GRADE, timestamp: 3,
      event: ev({ type: "missed", correctChar: "駿" }) });
    // 雜 0/1 = 0
    await applyEvent({ profileId: PROFILE, gradeId: GRADE, timestamp: 4,
      event: ev({ type: "found_wrong", correctChar: "雜", isCorrect: true }) });

    const top = await listTopMistakes(PROFILE, 10);
    expect(top.map((s) => s.char)).toEqual(["駿", "縫", "雜"]);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/charStatsStore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `charStatsStore.ts`**

```ts
// src/storage/charStatsStore.ts
import { getDB } from "./db";
import type { CharStat, PracticeEvent } from "./types";

export interface ApplyEventInput {
  profileId: string;
  gradeId: string;
  timestamp: number;
  event: PracticeEvent;
}

export async function applyEvent(input: ApplyEventInput): Promise<CharStat> {
  const { profileId, gradeId, timestamp, event } = input;
  const char = event.correctChar;
  const isSuccess = event.type === "found_wrong" && event.isCorrect;

  const db = await getDB();
  const tx = db.transaction("charStats", "readwrite");
  const existing = await tx.store.get([profileId, gradeId, char]);

  const base: CharStat = existing ?? {
    profileId,
    gradeId,
    char,
    lesson: event.lesson,
    lessonTitle: event.lessonTitle,
    word: event.word,
    attempts: 0,
    mistakes: 0,
    lastSeenAt: timestamp,
    lastMistakeAt: null,
    recentSuccessStreak: 0,
    mistakeRate: 0,
    updatedAt: timestamp,
    syncedAt: null,
  };

  const attempts = base.attempts + 1;
  const mistakes = base.mistakes + (isSuccess ? 0 : 1);
  const recentSuccessStreak = isSuccess ? base.recentSuccessStreak + 1 : 0;
  const lastMistakeAt = isSuccess ? base.lastMistakeAt : timestamp;

  const next: CharStat = {
    ...base,
    lesson: event.lesson,
    lessonTitle: event.lessonTitle,
    word: event.word,
    attempts,
    mistakes,
    lastSeenAt: timestamp,
    lastMistakeAt,
    recentSuccessStreak,
    mistakeRate: mistakes / attempts,
    updatedAt: timestamp,
    syncedAt: null,
  };

  await tx.store.put(next);
  await tx.done;
  return next;
}

export async function getStat(
  profileId: string,
  gradeId: string,
  char: string,
): Promise<CharStat | undefined> {
  const db = await getDB();
  return db.get("charStats", [profileId, gradeId, char]);
}

export async function listByProfile(profileId: string): Promise<CharStat[]> {
  const db = await getDB();
  return db.getAllFromIndex("charStats", "byProfile", profileId);
}

export async function listTopMistakes(profileId: string, n: number): Promise<CharStat[]> {
  const all = await listByProfile(profileId);
  return all
    .filter((s) => s.mistakes > 0)
    .sort((a, b) => b.mistakeRate - a.mistakeRate || b.mistakes - a.mistakes)
    .slice(0, n);
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/charStatsStore.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/storage/charStatsStore.ts frontend/src/storage/__tests__/charStatsStore.test.ts
git commit -m "feat(storage): charStats aggregation with applyEvent and topMistakes"
git push
```

### Task 1.6: `sessionStore.ts` with `recordSession` transaction

**Files:**
- Create: `frontend/src/storage/sessionStore.ts`
- Create: `frontend/src/storage/__tests__/sessionStore.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/storage/__tests__/sessionStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { DB_NAME, closeDB } from "../db";
import { recordSession, listByProfile, listByGradeLesson } from "../sessionStore";
import { getStat } from "../charStatsStore";
import { listByProfile as listImagesByProfile } from "../imageStore";
import type { PracticeEvent } from "../types";

beforeEach(async () => {
  closeDB();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

const baseSession = {
  profileId: "p1",
  gradeId: "4_kangxuan",
  gradeLabel: "四下 康軒版",
  startLesson: 1,
  endLesson: 3,
  mode: "article" as const,
  startedAt: 1000,
  finishedAt: 2000,
};

function ev(overrides: Partial<PracticeEvent> & { type: PracticeEvent["type"]; correctChar: string }): PracticeEvent {
  return {
    wrongChar: "錯",
    userAnswer: "?",
    isCorrect: false,
    lesson: 1,
    lessonTitle: "L1",
    word: "詞語",
    ...overrides,
  } as PracticeEvent;
}

describe("recordSession", () => {
  it("persists session, updates charStats, persists images", async () => {
    const events: PracticeEvent[] = [
      ev({ type: "found_wrong", correctChar: "縫", isCorrect: true, imageData: "data:img1" }),
      ev({ type: "found_wrong", correctChar: "駿", isCorrect: false, imageData: "data:img2" }),
      ev({ type: "missed", correctChar: "雜" }),
      ev({ type: "false_alarm", correctChar: "正", imageData: "data:img3" }),
    ];

    const session = await recordSession({ ...baseSession, events });

    // Session is stored
    const sessions = await listByProfile("p1");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(session.id);
    expect(sessions[0].summary).toEqual({
      totalWrong: 3,                   // found_wrong*2 + missed*1
      foundCorrect: 1,
      falseAlarms: 1,
      missed: 1,
      accuracy: 1 / (3 + 1),           // 0.25
    });

    // charStats updated for all 4 chars
    expect((await getStat("p1", "4_kangxuan", "縫"))!.attempts).toBe(1);
    expect((await getStat("p1", "4_kangxuan", "駿"))!.mistakes).toBe(1);
    expect((await getStat("p1", "4_kangxuan", "雜"))!.mistakes).toBe(1);
    expect((await getStat("p1", "4_kangxuan", "正"))!.mistakes).toBe(1);

    // 3 images persisted (no image for `missed`)
    const images = await listImagesByProfile("p1");
    expect(images).toHaveLength(3);
    expect(images.map((i) => i.char).sort()).toEqual(["正", "縫", "駿"]);
  });

  it("listByGradeLesson groups sessions by (grade, startLesson)", async () => {
    await recordSession({ ...baseSession, startLesson: 1, endLesson: 3, events: [] });
    await recordSession({ ...baseSession, startLesson: 1, endLesson: 3, events: [] });
    await recordSession({ ...baseSession, startLesson: 4, endLesson: 6, events: [] });
    const groups = await listByGradeLesson("p1");
    expect(groups).toEqual([
      { gradeId: "4_kangxuan", gradeLabel: "四下 康軒版", startLesson: 1, endLesson: 3, sessions: expect.any(Array) },
      { gradeId: "4_kangxuan", gradeLabel: "四下 康軒版", startLesson: 4, endLesson: 6, sessions: expect.any(Array) },
    ]);
    expect(groups[0].sessions).toHaveLength(2);
    expect(groups[1].sessions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/sessionStore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `sessionStore.ts`**

```ts
// src/storage/sessionStore.ts
import { getDB } from "./db";
import { applyEvent } from "./charStatsStore";
import { putImage } from "./imageStore";
import type { Session, PracticeEvent, SessionSummary } from "./types";

export interface RecordSessionInput {
  profileId: string;
  gradeId: string;
  gradeLabel: string;
  startLesson: number;
  endLesson: number;
  mode: "article" | "sentence";
  startedAt: number;
  finishedAt: number;
  events: PracticeEvent[];
}

function summarize(events: PracticeEvent[]): SessionSummary {
  let foundCorrect = 0;
  let foundWrong = 0;
  let missed = 0;
  let falseAlarms = 0;
  for (const e of events) {
    if (e.type === "found_wrong") {
      if (e.isCorrect) foundCorrect++;
      else foundWrong++;
    } else if (e.type === "missed") missed++;
    else if (e.type === "false_alarm") falseAlarms++;
  }
  const totalWrong = foundCorrect + foundWrong + missed;
  const denom = totalWrong + falseAlarms;
  return {
    totalWrong,
    foundCorrect,
    falseAlarms,
    missed,
    accuracy: denom > 0 ? foundCorrect / denom : 0,
  };
}

export async function recordSession(input: RecordSessionInput): Promise<Session> {
  const id = crypto.randomUUID();
  const session: Session = {
    id,
    profileId: input.profileId,
    gradeId: input.gradeId,
    gradeLabel: input.gradeLabel,
    startLesson: input.startLesson,
    endLesson: input.endLesson,
    mode: input.mode,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    events: input.events,
    summary: summarize(input.events),
    updatedAt: Date.now(),
    syncedAt: null,
  };
  const db = await getDB();
  await db.put("sessions", session);

  for (const e of input.events) {
    await applyEvent({
      profileId: input.profileId,
      gradeId: input.gradeId,
      timestamp: input.finishedAt,
      event: e,
    });
    if (e.imageData) {
      await putImage({
        profileId: input.profileId,
        sessionId: id,
        char: e.correctChar,
        capturedAt: input.finishedAt,
        imageData: e.imageData,
      });
    }
  }

  return session;
}

export async function listByProfile(profileId: string): Promise<Session[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("sessions", "byProfile", profileId);
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

export interface SessionGroup {
  gradeId: string;
  gradeLabel: string;
  startLesson: number;
  endLesson: number;
  sessions: Session[];
}

export async function listByGradeLesson(profileId: string): Promise<SessionGroup[]> {
  const all = await listByProfile(profileId);
  const map = new Map<string, SessionGroup>();
  for (const s of all) {
    const key = `${s.gradeId}|${s.startLesson}|${s.endLesson}`;
    let group = map.get(key);
    if (!group) {
      group = {
        gradeId: s.gradeId,
        gradeLabel: s.gradeLabel,
        startLesson: s.startLesson,
        endLesson: s.endLesson,
        sessions: [],
      };
      map.set(key, group);
    }
    group.sessions.push(s);
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      a.gradeId.localeCompare(b.gradeId) ||
      a.startLesson - b.startLesson,
  );
}
```

> **Note on transactionality:** `applyEvent` opens its own internal transaction. For Phase 1 the simpler "loop awaits" approach is acceptable (the only consumer is `recordSession`, called once at end of practice; partial failures are recoverable by retrying). If integration test in Phase 2 reveals practical issues, switch to one cross-store transaction. Don't preempt.

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/sessionStore.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/storage/sessionStore.ts frontend/src/storage/__tests__/sessionStore.test.ts
git commit -m "feat(storage): recordSession writes session + stats + images"
git push
```

### Task 1.7: `quota.ts`

**Files:**
- Create: `frontend/src/storage/quota.ts`
- Create: `frontend/src/storage/__tests__/quota.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/storage/__tests__/quota.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { ensureRoomForImage } from "../quota";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubStorage(usage: number, quota: number) {
  vi.stubGlobal("navigator", {
    ...navigator,
    storage: { estimate: async () => ({ usage, quota }) },
  });
}

describe("ensureRoomForImage", () => {
  it("returns 'ok' when usage well below warn threshold", async () => {
    stubStorage(1_000_000, 10_000_000); // 10%
    expect(await ensureRoomForImage(50_000)).toBe("ok");
  });

  it("returns 'warn' when projected usage between 80%-95%", async () => {
    stubStorage(8_000_000, 10_000_000); // 80%; +50K → 80.5%
    expect(await ensureRoomForImage(50_000)).toBe("warn");
  });

  it("returns 'block' when projected usage above 95%", async () => {
    stubStorage(9_600_000, 10_000_000); // 96%
    expect(await ensureRoomForImage(50_000)).toBe("block");
  });

  it("defaults to 'ok' when storage.estimate unavailable", async () => {
    vi.stubGlobal("navigator", { ...navigator, storage: undefined });
    expect(await ensureRoomForImage(50_000)).toBe("ok");
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/quota.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `quota.ts`**

```ts
// src/storage/quota.ts
export type QuotaState = "ok" | "warn" | "block";

const WARN_THRESHOLD = 0.8;
const BLOCK_THRESHOLD = 0.95;

export async function ensureRoomForImage(estimatedBytes: number): Promise<QuotaState> {
  const storage = navigator.storage;
  if (!storage || !storage.estimate) return "ok";
  const { usage, quota } = await storage.estimate();
  if (!quota) return "ok";
  const projected = (usage ?? 0) + estimatedBytes;
  const pct = projected / quota;
  if (pct > BLOCK_THRESHOLD) return "block";
  if (pct > WARN_THRESHOLD) return "warn";
  return "ok";
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  pct: number;
}

export async function getEstimate(): Promise<StorageEstimate | null> {
  const storage = navigator.storage;
  if (!storage || !storage.estimate) return null;
  const { usage, quota } = await storage.estimate();
  if (!quota) return null;
  return { usage: usage ?? 0, quota, pct: (usage ?? 0) / quota };
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/quota.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Run full storage test suite to catch cross-module regressions**

Run: `cd frontend && npm run test:run -- src/storage/`
Expected: all storage tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/storage/quota.ts frontend/src/storage/__tests__/quota.test.ts
git commit -m "feat(storage): storage quota helper"
git push
```

---

## Phase 2: Personalization Context + Profile UI

> Phase 2 wires Phase 1 storage into the React app. Practice sessions are recorded, but no dashboard yet (Phase 4) and no weighted_chars yet (Phase 3).

### Task 2.1: `AnswerResult` augment + `WrongChar.word`

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/ArticlePractice.tsx`

- [ ] **Step 1: Add `word` to `WrongChar` and `AnswerResult`**

In `frontend/src/types.ts`, change `WrongChar`:

```ts
export interface WrongChar {
  position: number;
  wrong_char: string;
  correct_char: string;
  lesson: number;
  lesson_title: string;
  word: string;
}
```

Backend already returns `word` (see `backend/main.py:218`); the frontend type was just missing it.

- [ ] **Step 2: Augment `AnswerResult` in `ArticlePractice.tsx`**

In `frontend/src/components/ArticlePractice.tsx` (the exported `AnswerResult` interface near line 15):

```ts
export interface AnswerResult {
  wrongChar: string;
  correctChar: string;
  userAnswer: string;
  isCorrect: boolean;
  lesson: number;
  lessonTitle: string;
  word: string;        // NEW — for personalization aggregation
  gradeId: string;     // NEW
  type: "found_wrong" | "false_alarm" | "missed";
  imageData?: string;
}
```

- [ ] **Step 3: Populate `word` and `gradeId` in `ArticlePractice` event builders**

In `recognizeWrongChar` (currently around line 91), change the `result` object:

```ts
const result: AnswerResult = {
  wrongChar: wrongChar.wrong_char,
  correctChar: wrongChar.correct_char,
  userAnswer: response.recognized_char,
  isCorrect: response.is_correct,
  lesson: wrongChar.lesson,
  lessonTitle: wrongChar.lesson_title,
  word: wrongChar.word,                  // NEW
  gradeId,                               // NEW (component prop)
  type: "found_wrong",
  imageData,
};
```

In `recognizeCorrectChar` (around line 161):

```ts
const result: AnswerResult = {
  wrongChar: originalChar,
  correctChar: originalChar,
  userAnswer: response.recognized_char,
  isCorrect: false,
  lesson: 0,
  lessonTitle: "",
  word: "",                              // NEW (no lesson/word context for false alarms)
  gradeId,                               // NEW
  type: "false_alarm",
  imageData,
};
```

In `handleFinish` (around line 245), augment the `missed` push:

```ts
allResults.push({
  wrongChar: wc.wrong_char,
  correctChar: wc.correct_char,
  userAnswer: "",
  isCorrect: false,
  lesson: wc.lesson,
  lessonTitle: wc.lesson_title,
  word: wc.word,                         // NEW
  gradeId,                               // NEW
  type: "missed",
});
```

- [ ] **Step 4: Build verifies (no test for this trivial typing change)**

Run: `cd frontend && npm run build`
Expected: success with zero TS errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/components/ArticlePractice.tsx
git commit -m "feat: thread word/gradeId through AnswerResult"
git push
```

### Task 2.2: Harden `applyEvent` against empty meta from false_alarm

**Files:**
- Modify: `frontend/src/storage/charStatsStore.ts`
- Modify: `frontend/src/storage/__tests__/charStatsStore.test.ts`

> **Why:** A `false_alarm` event has `word === ""` and `lesson === 0` because the false-alarm char wasn't tied to any wrong-char metadata. `applyEvent` currently overwrites these fields unconditionally, which would erase good metadata captured from a previous `found_wrong` of the same char. Fix: only overwrite meta when the event provides non-empty values.

- [ ] **Step 1: Add failing test**

Append to `frontend/src/storage/__tests__/charStatsStore.test.ts` inside the `charStatsStore.applyEvent` describe block:

```ts
it("false_alarm preserves existing lesson/word when event has empty meta", async () => {
  // Seed with a real lesson via found_wrong
  await applyEvent({
    profileId: PROFILE, gradeId: GRADE, timestamp: 1,
    event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: false, lesson: 3, lessonTitle: "L3", word: "縫補" }),
  });
  // false_alarm with empty meta should not wipe lesson/word
  await applyEvent({
    profileId: PROFILE, gradeId: GRADE, timestamp: 2,
    event: ev({ type: "false_alarm", correctChar: "縫", lesson: 0, lessonTitle: "", word: "" }),
  });
  const s = await getStat(PROFILE, GRADE, "縫");
  expect(s).toMatchObject({ attempts: 2, mistakes: 2, lesson: 3, lessonTitle: "L3", word: "縫補" });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/charStatsStore.test.ts`
Expected: 1 failure (lesson became 0).

- [ ] **Step 3: Update `applyEvent` to guard meta writes**

In `frontend/src/storage/charStatsStore.ts`, replace the `next: CharStat = { ... }` block with:

```ts
const hasFreshMeta = event.word !== "" && event.lesson > 0;

const next: CharStat = {
  ...base,
  lesson: hasFreshMeta ? event.lesson : base.lesson,
  lessonTitle: hasFreshMeta ? event.lessonTitle : base.lessonTitle,
  word: hasFreshMeta ? event.word : base.word,
  attempts,
  mistakes,
  lastSeenAt: timestamp,
  lastMistakeAt,
  recentSuccessStreak,
  mistakeRate: mistakes / attempts,
  updatedAt: timestamp,
  syncedAt: null,
};
```

Also update the `base` initializer to fall back to safe defaults when there's no existing record and the event has empty meta:

```ts
const base: CharStat = existing ?? {
  profileId,
  gradeId,
  char,
  lesson: event.lesson || 0,
  lessonTitle: event.lessonTitle || "",
  word: event.word || "",
  attempts: 0,
  mistakes: 0,
  lastSeenAt: timestamp,
  lastMistakeAt: null,
  recentSuccessStreak: 0,
  mistakeRate: 0,
  updatedAt: timestamp,
  syncedAt: null,
};
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/charStatsStore.test.ts`
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/storage/charStatsStore.ts frontend/src/storage/__tests__/charStatsStore.test.ts
git commit -m "feat(storage): guard charStats meta against empty false_alarm overwrites"
git push
```

### Task 2.3: `PersonalizationContext.tsx`

**Files:**
- Create: `frontend/src/personalization/PersonalizationContext.tsx`
- Create: `frontend/src/personalization/__tests__/PersonalizationContext.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// src/personalization/__tests__/PersonalizationContext.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useEffect } from "react";
import {
  PersonalizationProvider,
  usePersonalization,
  PERSONALIZATION_ENABLED_KEY,
  ACTIVE_PROFILE_KEY,
} from "../PersonalizationContext";
import { DB_NAME, closeDB } from "../../storage/db";

beforeEach(async () => {
  localStorage.clear();
  closeDB();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

function Spy({ onCtx }: { onCtx: (ctx: ReturnType<typeof usePersonalization>) => void }) {
  const ctx = usePersonalization();
  useEffect(() => { onCtx(ctx); });
  return null;
}

describe("PersonalizationContext", () => {
  it("defaults to enabled=false, activeProfile=null", async () => {
    let captured: ReturnType<typeof usePersonalization> | null = null;
    render(
      <PersonalizationProvider>
        <Spy onCtx={(c) => (captured = c)} />
      </PersonalizationProvider>,
    );
    await act(async () => {});
    expect(captured!.enabled).toBe(false);
    expect(captured!.activeProfile).toBeNull();
  });

  it("persists enabled toggle to localStorage", async () => {
    let captured: ReturnType<typeof usePersonalization> | null = null;
    render(
      <PersonalizationProvider>
        <Spy onCtx={(c) => (captured = c)} />
      </PersonalizationProvider>,
    );
    await act(async () => {});
    await act(async () => { captured!.setEnabled(true); });
    expect(localStorage.getItem(PERSONALIZATION_ENABLED_KEY)).toBe("true");
  });

  it("setActiveProfile persists profile id to localStorage", async () => {
    let captured: ReturnType<typeof usePersonalization> | null = null;
    render(
      <PersonalizationProvider>
        <Spy onCtx={(c) => (captured = c)} />
      </PersonalizationProvider>,
    );
    await act(async () => {});
    await act(async () => {
      const p = await captured!.createProfile("小明", "🐶");
      await captured!.setActiveProfile(p.id);
    });
    expect(localStorage.getItem(ACTIVE_PROFILE_KEY)).toBeTruthy();
  });

  it("rehydrates enabled and activeProfile from localStorage on mount", async () => {
    // Pre-create a profile
    const { createProfile } = await import("../../storage/profileStore");
    const p = await createProfile({ name: "小明", emoji: "🐶" });
    localStorage.setItem(PERSONALIZATION_ENABLED_KEY, "true");
    localStorage.setItem(ACTIVE_PROFILE_KEY, p.id);

    let captured: ReturnType<typeof usePersonalization> | null = null;
    render(
      <PersonalizationProvider>
        <Spy onCtx={(c) => (captured = c)} />
      </PersonalizationProvider>,
    );
    await act(async () => {});
    expect(captured!.enabled).toBe(true);
    expect(captured!.activeProfile?.id).toBe(p.id);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && npm run test:run -- src/personalization/__tests__/PersonalizationContext.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `PersonalizationContext.tsx`**

```tsx
// src/personalization/PersonalizationContext.tsx
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { Profile } from "../storage/types";
import {
  createProfile as storageCreateProfile,
  listProfiles as storageListProfiles,
  deleteProfile as storageDeleteProfile,
  getProfile as storageGetProfile,
  touchProfile,
} from "../storage/profileStore";

export const PERSONALIZATION_ENABLED_KEY = "rightwrite:personalization:enabled";
export const ACTIVE_PROFILE_KEY = "rightwrite:personalization:activeProfile";

interface PersonalizationContextValue {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  activeProfile: Profile | null;
  setActiveProfile: (id: string | null) => Promise<void>;
  profiles: Profile[];
  refreshProfiles: () => Promise<void>;
  createProfile: (name: string, emoji: string) => Promise<Profile>;
  deleteProfile: (id: string) => Promise<void>;
}

const Ctx = createContext<PersonalizationContextValue | null>(null);

export function PersonalizationProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const refreshProfiles = useCallback(async () => {
    setProfiles(await storageListProfiles());
  }, []);

  // Initial rehydrate
  useEffect(() => {
    const enabledStored = localStorage.getItem(PERSONALIZATION_ENABLED_KEY) === "true";
    setEnabledState(enabledStored);
    (async () => {
      await refreshProfiles();
      const activeId = localStorage.getItem(ACTIVE_PROFILE_KEY);
      if (activeId) {
        const p = await storageGetProfile(activeId);
        if (p) setActiveProfileState(p);
      }
    })();
  }, [refreshProfiles]);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    localStorage.setItem(PERSONALIZATION_ENABLED_KEY, String(v));
  }, []);

  const setActiveProfile = useCallback(async (id: string | null) => {
    if (id === null) {
      setActiveProfileState(null);
      localStorage.removeItem(ACTIVE_PROFILE_KEY);
      return;
    }
    const p = await storageGetProfile(id);
    if (!p) return;
    await touchProfile(id);
    setActiveProfileState(p);
    localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  }, []);

  const createProfile = useCallback(async (name: string, emoji: string) => {
    const p = await storageCreateProfile({ name, emoji });
    await refreshProfiles();
    return p;
  }, [refreshProfiles]);

  const deleteProfile = useCallback(async (id: string) => {
    await storageDeleteProfile(id);
    await refreshProfiles();
    if (activeProfile?.id === id) {
      setActiveProfileState(null);
      localStorage.removeItem(ACTIVE_PROFILE_KEY);
    }
  }, [activeProfile, refreshProfiles]);

  return (
    <Ctx.Provider
      value={{ enabled, setEnabled, activeProfile, setActiveProfile, profiles, refreshProfiles, createProfile, deleteProfile }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePersonalization(): PersonalizationContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePersonalization must be used inside PersonalizationProvider");
  return ctx;
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test:run -- src/personalization/__tests__/PersonalizationContext.test.tsx`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/personalization/PersonalizationContext.tsx frontend/src/personalization/__tests__/PersonalizationContext.test.tsx
git commit -m "feat(personalization): context with toggle + profile state"
git push
```

### Task 2.4: `ProfilePicker.tsx` UI

**Files:**
- Create: `frontend/src/personalization/ProfilePicker.tsx`

> No unit test for the picker UI itself — visual confidence comes from manual verification in Task 2.7. Logic that matters (createProfile/deleteProfile/setActiveProfile) is already tested in Task 2.3.

- [ ] **Step 1: Implement `ProfilePicker.tsx`**

```tsx
// src/personalization/ProfilePicker.tsx
import { useState } from "react";
import { usePersonalization } from "./PersonalizationContext";
import { AVAILABLE_EMOJIS } from "../storage/types";

export default function ProfilePicker() {
  const { profiles, activeProfile, setActiveProfile, createProfile, deleteProfile } = usePersonalization();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string>(AVAILABLE_EMOJIS[0]);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const p = await createProfile(trimmed.slice(0, 6), emoji);
    await setActiveProfile(p.id);
    setName("");
    setEmoji(AVAILABLE_EMOJIS[0]);
    setShowAdd(false);
  };

  const handleDelete = async (id: string, displayName: string) => {
    if (!confirm(`要刪除 ${displayName} 的所有紀錄嗎？此動作無法復原。`)) return;
    await deleteProfile(id);
  };

  return (
    <div className="profile-picker">
      <div className="profile-picker-cards">
        {profiles.map((p) => (
          <button
            key={p.id}
            className={`profile-card ${activeProfile?.id === p.id ? "active" : ""}`}
            onClick={() => setActiveProfile(p.id)}
          >
            <span className="profile-emoji">{p.emoji}</span>
            <span className="profile-name">{p.name}</span>
            <span
              className="profile-delete"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(p.id, p.name);
              }}
              role="button"
              aria-label={`刪除 ${p.name}`}
            >
              ×
            </span>
          </button>
        ))}
        <button className="profile-add-btn" onClick={() => setShowAdd(true)}>
          ➕ 新增
        </button>
      </div>

      {showAdd && (
        <div className="profile-add-modal" role="dialog">
          <div className="profile-add-modal-content">
            <h3>新增小朋友</h3>
            <label>
              名字（最多 6 字）
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 6))}
                placeholder="小明"
                autoFocus
              />
            </label>
            <label>選個動物</label>
            <div className="emoji-grid">
              {AVAILABLE_EMOJIS.map((e) => (
                <button
                  key={e}
                  className={`emoji-option ${emoji === e ? "selected" : ""}`}
                  onClick={() => setEmoji(e)}
                  type="button"
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="profile-add-actions">
              <button onClick={() => setShowAdd(false)}>取消</button>
              <button className="primary" onClick={handleAdd} disabled={!name.trim()}>
                建立
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add styles to `frontend/src/index.css`**

Append to `frontend/src/index.css`:

```css
.profile-picker {
  margin: 12px 0;
}
.profile-picker-cards {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.profile-card {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--cream, #fff8ec);
  border: 2px solid transparent;
  border-radius: 24px;
  font-size: 16px;
  cursor: pointer;
  position: relative;
  font-family: inherit;
  transition: transform 0.15s, border-color 0.15s;
}
.profile-card.active {
  border-color: var(--coral, #ff6b6b);
  transform: scale(1.05);
}
.profile-card:hover {
  transform: scale(1.05);
}
.profile-emoji {
  font-size: 20px;
}
.profile-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0,0,0,0.1);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.profile-delete:hover {
  background: var(--coral, #ff6b6b);
  color: white;
}
.profile-add-btn {
  padding: 8px 14px;
  background: transparent;
  border: 2px dashed #bbb;
  border-radius: 24px;
  cursor: pointer;
  font-family: inherit;
}

.profile-add-modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.profile-add-modal-content {
  background: white;
  padding: 24px;
  border-radius: 16px;
  min-width: 320px;
  max-width: 90vw;
}
.profile-add-modal-content label {
  display: block;
  margin: 12px 0 4px;
  font-weight: 600;
}
.profile-add-modal-content input {
  width: 100%;
  padding: 8px 12px;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 16px;
  font-family: inherit;
}
.emoji-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}
.emoji-option {
  font-size: 24px;
  padding: 12px;
  border: 2px solid #ddd;
  border-radius: 12px;
  background: white;
  cursor: pointer;
}
.emoji-option.selected {
  border-color: var(--coral, #ff6b6b);
  background: var(--cream, #fff8ec);
}
.profile-add-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}
.profile-add-actions button {
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  font-family: inherit;
}
.profile-add-actions button.primary {
  background: var(--coral, #ff6b6b);
  color: white;
  border-color: var(--coral, #ff6b6b);
}
.profile-add-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Build check**

Run: `cd frontend && npm run build`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/personalization/ProfilePicker.tsx frontend/src/index.css
git commit -m "feat(personalization): ProfilePicker UI"
git push
```

### Task 2.5: Wrap `App.tsx` with `PersonalizationProvider` + add dashboard stage

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Extend `AppStage` type in `types.ts`**

```ts
export type AppStage = "select" | "practice" | "result" | "dashboard";
```

- [ ] **Step 2: Modify `App.tsx`**

Replace the top of `frontend/src/App.tsx`:

```tsx
import { useState } from "react";
import type { AppStage, PracticeMode } from "./types";
import type { AnswerResult } from "./components/ArticlePractice";
import LessonSelector from "./components/LessonSelector";
import ArticlePractice from "./components/ArticlePractice";
import ResultView from "./components/ResultView";
import { PersonalizationProvider } from "./personalization/PersonalizationContext";

function App() {
  const [stage, setStage] = useState<AppStage>("select");
  const [lessonRange, setLessonRange] = useState<[number, number]>([1, 6]);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("article");
  const [gradeId, setGradeId] = useState("grade4");
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [practiceKey, setPracticeKey] = useState(0);

  const handleStart = (start: number, end: number, mode: PracticeMode, grade: string) => {
    setLessonRange([start, end]);
    setPracticeMode(mode);
    setGradeId(grade);
    setPracticeKey((k) => k + 1);
    setStage("practice");
  };

  const handleFinish = (answerResults: AnswerResult[]) => {
    setResults(answerResults);
    setStage("result");
  };

  const handleRetry = () => {
    setPracticeKey((k) => k + 1);
    setStage("practice");
  };

  const handleBack = () => {
    setStage("select");
    setResults([]);
  };

  return (
    <PersonalizationProvider>
      <div className="app">
        {stage === "select" && (
          <LessonSelector onStart={handleStart} onOpenDashboard={() => setStage("dashboard")} />
        )}
        {stage === "practice" && (
          <ArticlePractice
            key={practiceKey}
            startLesson={lessonRange[0]}
            endLesson={lessonRange[1]}
            practiceMode={practiceMode}
            gradeId={gradeId}
            onFinish={handleFinish}
            onBack={handleBack}
          />
        )}
        {stage === "result" && (
          <ResultView results={results} onRetry={handleRetry} onBack={handleBack} />
        )}
        {stage === "dashboard" && (
          // Dashboard component lands in Phase 4; placeholder for now
          <div style={{ padding: 24 }}>
            <button onClick={handleBack}>← 返回</button>
            <h2>學習儀表板</h2>
            <p>儀表板將於 Phase 4 上線。</p>
          </div>
        )}
      </div>
    </PersonalizationProvider>
  );
}

export default App;
```

- [ ] **Step 3: Do NOT run build yet**

Build will fail until Task 2.6 adds `onOpenDashboard` to `LessonSelector`. Continue directly to Task 2.6 and run build there.

- [ ] **Step 4: Defer commit until Task 2.6.**

### Task 2.6: `LessonSelector` integration — ⚙️ + ProfilePicker + dashboard link

**Files:**
- Modify: `frontend/src/components/LessonSelector.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Read current `LessonSelector.tsx`**

Run: `head -60 frontend/src/components/LessonSelector.tsx` to refresh memory on the existing structure (publishers/grades/lessons radio groups).

- [ ] **Step 2: Modify `LessonSelector.tsx`**

Update the component signature and the top of its returned JSX. Add at the top of the file:

```tsx
import { useState } from "react";
import { usePersonalization } from "../personalization/PersonalizationContext";
import ProfilePicker from "../personalization/ProfilePicker";
```

Update the component signature (keep existing implementation, just add prop):

```tsx
interface Props {
  onStart: (start: number, end: number, mode: PracticeMode, grade: string) => void;
  onOpenDashboard: () => void;
}

export default function LessonSelector({ onStart, onOpenDashboard }: Props) {
  const personalization = usePersonalization();
  const [showSettings, setShowSettings] = useState(false);
  // ... existing state untouched
```

Add a settings bar at the very top of the returned JSX, before the existing publisher/grade selectors:

```tsx
return (
  <div className="lesson-selector-container">
    {/* NEW: settings bar */}
    <div className="settings-bar">
      <h1 className="app-title">RightWrite 改錯字練習</h1>
      <div className="settings-bar-right">
        {personalization.enabled && personalization.activeProfile && (
          <button className="dashboard-btn" onClick={onOpenDashboard}>
            📊 報表
          </button>
        )}
        <button className="settings-btn" onClick={() => setShowSettings((v) => !v)} aria-label="設定">
          ⚙️
        </button>
      </div>
    </div>

    {showSettings && (
      <div className="settings-dropdown">
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={personalization.enabled}
            onChange={(e) => personalization.setEnabled(e.target.checked)}
          />
          <span>個人化記錄</span>
        </label>
        <p className="settings-hint">
          開啟後可以追蹤每位小朋友的學習狀況、看到報表、自動複習錯字。
        </p>
      </div>
    )}

    {personalization.enabled && (
      <ProfilePicker />
    )}

    {personalization.enabled && !personalization.activeProfile && (
      <div className="profile-required-banner">
        👆 請先選擇或新增一位小朋友再開始練習
      </div>
    )}

    {/* ... existing publisher/grade/lesson selectors unchanged ... */}
  </div>
);
```

Update the "開始練習" button to be disabled when personalization is on but no active profile:

```tsx
<button
  className="start-btn"
  onClick={() => onStart(start, end, mode, gradeId)}
  disabled={personalization.enabled && !personalization.activeProfile}
>
  開始練習 →
</button>
```

- [ ] **Step 3: Append styles to `index.css`**

```css
.settings-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.settings-bar-right {
  display: flex;
  gap: 8px;
  align-items: center;
}
.settings-btn,
.dashboard-btn {
  font-size: 20px;
  padding: 8px 12px;
  background: white;
  border: 2px solid #eee;
  border-radius: 50%;
  cursor: pointer;
  font-family: inherit;
}
.dashboard-btn {
  border-radius: 24px;
  font-size: 14px;
  background: var(--cream, #fff8ec);
}
.settings-dropdown {
  position: absolute;
  right: 16px;
  top: 60px;
  background: white;
  padding: 16px;
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.12);
  z-index: 100;
  width: 260px;
}
.settings-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.settings-hint {
  font-size: 12px;
  color: #888;
  margin: 8px 0 0;
}
.profile-required-banner {
  background: var(--cream, #fff8ec);
  padding: 12px 16px;
  border-radius: 12px;
  text-align: center;
  margin-bottom: 16px;
  border: 2px dashed #ffa94d;
}
```

- [ ] **Step 4: Build check**

Run: `cd frontend && npm run build`
Expected: zero errors.

- [ ] **Step 5: Commit (App.tsx + LessonSelector + types together — single atomic feature)**

```bash
git add frontend/src/App.tsx frontend/src/types.ts \
        frontend/src/components/LessonSelector.tsx frontend/src/index.css
git commit -m "feat(personalization): wire toggle, profile picker, dashboard entry into selector"
git push
```

### Task 2.7: `ArticlePractice` → `recordSession` on finish

**Files:**
- Modify: `frontend/src/components/ArticlePractice.tsx`

- [ ] **Step 1: Import dependencies**

At top of `ArticlePractice.tsx`, add:

```tsx
import { usePersonalization } from "../personalization/PersonalizationContext";
import { recordSession } from "../storage/sessionStore";
import type { PracticeEvent } from "../storage/types";
```

- [ ] **Step 2: Capture start time and personalization context inside the component**

Inside `ArticlePractice` function, near the top (after the existing `useState` calls):

```tsx
const personalization = usePersonalization();
const [startedAt] = useState(() => Date.now());
```

- [ ] **Step 3: Modify `handleFinish` to persist the session**

Replace the existing `handleFinish` with:

```tsx
const handleFinish = async () => {
  const allResults = [...results];
  for (const wc of article!.wrong_chars) {
    const found = allResults.find(
      (r) => r.type === "found_wrong" && r.correctChar === wc.correct_char && r.wrongChar === wc.wrong_char,
    );
    if (!found) {
      allResults.push({
        wrongChar: wc.wrong_char,
        correctChar: wc.correct_char,
        userAnswer: "",
        isCorrect: false,
        lesson: wc.lesson,
        lessonTitle: wc.lesson_title,
        word: wc.word,
        gradeId,
        type: "missed",
      });
    }
  }

  // Persist if personalization is on and a profile is active
  if (personalization.enabled && personalization.activeProfile) {
    const events: PracticeEvent[] = allResults.map((r) => ({
      type: r.type,
      wrongChar: r.wrongChar,
      correctChar: r.correctChar,
      userAnswer: r.userAnswer,
      isCorrect: r.isCorrect,
      lesson: r.lesson,
      lessonTitle: r.lessonTitle,
      word: r.word,
      imageData: r.imageData,
    }));
    try {
      await recordSession({
        profileId: personalization.activeProfile.id,
        gradeId,
        gradeLabel: gradeId, // refined below — could pass grade label from props if needed
        startLesson,
        endLesson,
        mode: practiceMode,
        startedAt,
        finishedAt: Date.now(),
        events,
      });
    } catch (err) {
      console.error("Failed to record session", err);
    }
  }

  onFinish(allResults);
};
```

> **Note:** `gradeLabel` falls back to `gradeId` for now. We'll thread the human-readable label through props in Task 2.8 if needed; for Phase 4 the label is mostly cosmetic in `LessonProgressGrid`.

- [ ] **Step 4: Build check**

Run: `cd frontend && npm run build`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ArticlePractice.tsx
git commit -m "feat(personalization): record session on practice finish"
git push
```

### Task 2.8: Pass `gradeLabel` from `LessonSelector` to `ArticlePractice`

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/LessonSelector.tsx`
- Modify: `frontend/src/components/ArticlePractice.tsx`

- [ ] **Step 1: `LessonSelector` already knows `selectedGrade.label`. Extend `onStart` signature**

In `LessonSelector.tsx`, change the `onStart` signature:

```tsx
interface Props {
  onStart: (start: number, end: number, mode: PracticeMode, grade: string, gradeLabel: string) => void;
  onOpenDashboard: () => void;
}
```

When calling `onStart`, pass the label (find the variable in current code that holds the selected grade's `.label`; it appears in the grade radio rendering — e.g. `selectedGrade.label`):

```tsx
onClick={() => onStart(start, end, mode, gradeId, selectedGrade.label)}
```

- [ ] **Step 2: Thread through `App.tsx`**

```tsx
const [gradeLabel, setGradeLabel] = useState("");

const handleStart = (start: number, end: number, mode: PracticeMode, grade: string, label: string) => {
  setLessonRange([start, end]);
  setPracticeMode(mode);
  setGradeId(grade);
  setGradeLabel(label);
  setPracticeKey((k) => k + 1);
  setStage("practice");
};

// Pass to ArticlePractice
<ArticlePractice ... gradeLabel={gradeLabel} ... />
```

- [ ] **Step 3: Receive in `ArticlePractice`**

```tsx
interface Props {
  startLesson: number;
  endLesson: number;
  practiceMode: PracticeMode;
  gradeId: string;
  gradeLabel: string;    // NEW
  onFinish: (results: AnswerResult[]) => void;
  onBack: () => void;
}
```

And in `recordSession` call, replace `gradeLabel: gradeId` with `gradeLabel`.

- [ ] **Step 4: Build check + commit**

```bash
cd frontend && npm run build
git add frontend/src/App.tsx frontend/src/components/LessonSelector.tsx frontend/src/components/ArticlePractice.tsx
git commit -m "feat: thread gradeLabel through practice flow"
git push
```

### Task 2.9: Manual verification

- [ ] **Step 1: Run dev servers**

Run from project root:
```bash
# Terminal 1
cd backend && uvicorn main:app --reload

# Terminal 2
cd frontend && npm run dev
```

- [ ] **Step 2: Open http://localhost:5173 — verify default state**

Expected:
- ⚙️ button visible top-right
- 📊 button NOT visible (personalization off)
- No profile picker
- Existing publisher/grade/lesson selectors work as before
- "開始練習" enabled

- [ ] **Step 3: Open settings, toggle on personalization**

Expected:
- Profile picker appears
- "👆 請先選擇或新增一位小朋友" banner appears
- "開始練習" disabled

- [ ] **Step 4: Add a profile "小明" 🐶**

Expected:
- Card appears, automatically active (highlighted)
- Banner gone
- "開始練習" enabled
- 📊 button visible

- [ ] **Step 5: Complete a practice session**

Expected:
- Practice flow unchanged
- After finishing, open browser DevTools → Application → IndexedDB → `rightwrite-personalization` and verify:
  - `sessions` contains one entry with the events
  - `charStats` has entries for each char that appeared
  - `handwritingImages` has entries for the ones with images

- [ ] **Step 6: Toggle personalization off, complete another session**

Expected:
- IndexedDB unchanged from session 1 — no new session recorded

- [ ] **Step 7: Toggle back on. Verify active profile is restored from localStorage.**

- [ ] **Step 8: Add a second profile, switch between them. Verify isolation.**

- [ ] **Step 9: Delete the first profile (× button).**

Expected:
- Confirm prompt
- After deletion, active profile cleared if it was the deleted one

- [ ] **Step 10: Commit findings (any small fixes if found)**

If a fix is required, commit it. Otherwise just note "Phase 2 manually verified" in your work log.

---

## Phase 3: Backend `weighted_chars` + frontend weight calculation

> Phase 3 adds weighted random sampling. After this phase, completing more sessions makes "曾錯過的字" appear more often in subsequent articles.

### Task 3.1: Backend `_weighted_sample_without_replacement` helper

**Files:**
- Modify: `backend/main.py`
- Create: `backend/tests/test_weighted_sample.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_weighted_sample.py
import random
from collections import Counter

import pytest

from main import _weighted_sample_without_replacement


def test_empty_returns_empty():
    assert _weighted_sample_without_replacement([], [], 5) == []


def test_k_zero_returns_empty():
    assert _weighted_sample_without_replacement(["a", "b"], [1.0, 1.0], 0) == []


def test_k_at_least_population_returns_full_population():
    # When k >= len(population), all are returned
    result = _weighted_sample_without_replacement(["a", "b", "c"], [1.0, 1.0, 1.0], 10)
    assert sorted(result) == ["a", "b", "c"]


def test_no_replacement_unique():
    pop = list(range(20))
    weights = [1.0] * 20
    out = _weighted_sample_without_replacement(pop, weights, 5)
    assert len(out) == 5
    assert len(set(out)) == 5


def test_heavily_weighted_item_appears_far_more_often():
    """Item with weight=100 should be sampled in nearly every draw."""
    random.seed(0)
    pop = ["heavy", "light1", "light2", "light3", "light4"]
    weights = [100.0, 1.0, 1.0, 1.0, 1.0]
    counter = Counter()
    trials = 500
    for _ in range(trials):
        out = _weighted_sample_without_replacement(pop, weights, 1)
        counter.update(out)
    # heavy should be picked in > 90% of trials with such skew
    assert counter["heavy"] > trials * 0.9


def test_uniform_weights_distribute_roughly_evenly():
    random.seed(0)
    pop = ["a", "b", "c", "d"]
    weights = [1.0, 1.0, 1.0, 1.0]
    counter = Counter()
    trials = 4000
    for _ in range(trials):
        counter.update(_weighted_sample_without_replacement(pop, weights, 1))
    for item in pop:
        assert 0.18 < counter[item] / trials < 0.32  # tolerance around 0.25


def test_raises_on_mismatched_lengths():
    with pytest.raises(ValueError):
        _weighted_sample_without_replacement(["a", "b"], [1.0], 1)


def test_zero_weight_never_selected():
    random.seed(0)
    pop = ["a", "b", "c"]
    weights = [0.0, 1.0, 1.0]
    counter = Counter()
    for _ in range(200):
        counter.update(_weighted_sample_without_replacement(pop, weights, 1))
    assert counter["a"] == 0
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd backend && python -m pytest tests/test_weighted_sample.py -v`
Expected: ImportError on `_weighted_sample_without_replacement`.

- [ ] **Step 3: Implement helper in `backend/main.py`**

Add near the top of `main.py` (after imports, before `app = FastAPI(...)`):

```python
import math
from typing import Sequence, TypeVar

T = TypeVar("T")


def _weighted_sample_without_replacement(
    population: Sequence[T], weights: Sequence[float], k: int
) -> list[T]:
    """Sample k items from population without replacement, weighted.

    Uses Efraimidis-Spirakis algorithm: each item gets key = random()**(1/weight),
    take top-k by key. Items with weight <= 0 are excluded.
    """
    if len(population) != len(weights):
        raise ValueError("population and weights must have the same length")
    if k <= 0 or not population:
        return []
    pairs = [
        (random.random() ** (1.0 / w) if w > 0 else -math.inf, item)
        for item, w in zip(population, weights)
    ]
    pairs.sort(key=lambda p: p[0], reverse=True)
    # Drop -inf entries (weight 0) so they're never selected
    filtered = [item for key, item in pairs if key != -math.inf]
    return filtered[:k]
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd backend && python -m pytest tests/test_weighted_sample.py -v`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_weighted_sample.py
git commit -m "feat(backend): weighted sample without replacement helper"
git push
```

### Task 3.2: Add `weighted_chars` to `GenerateArticleRequest`

**Files:**
- Modify: `backend/main.py`
- Create: `backend/tests/test_generate.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_generate.py
import random
from collections import Counter

from main import generate_article_with_errors


def test_uniform_no_weights_works_same_as_before():
    random.seed(0)
    result = generate_article_with_errors(1, 3, "sentence", "4_kangxuan")
    assert "wrong_chars" in result
    assert len(result["wrong_chars"]) >= 5


def test_weighted_chars_skews_selection():
    """Heavily weighted chars appear in wrong_chars more often."""
    # Pick a char that's definitely in lessons 1-3 of 4_kangxuan
    from vocab_data import get_all_characters_in_range
    chars = get_all_characters_in_range(1, 3, "4_kangxuan")
    target_char = chars[0]  # some char in range

    random.seed(0)
    counts = Counter()
    trials = 30  # heavy weight, so each trial likely picks target_char
    for _ in range(trials):
        result = generate_article_with_errors(
            1, 3, "sentence", "4_kangxuan",
            weighted_chars={target_char: 1000.0},
        )
        for wc in result["wrong_chars"]:
            counts[wc["correct_char"]] += 1

    # target_char should be the most-picked correct_char
    top = counts.most_common(1)[0][0]
    assert top == target_char
```

Notice: `generate_article_with_errors` needs to accept `weighted_chars` parameter.

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd backend && python -m pytest tests/test_generate.py -v`
Expected: `TypeError: unexpected keyword argument 'weighted_chars'` (or similar).

- [ ] **Step 3: Update `GenerateArticleRequest` and the generate function**

In `backend/main.py`:

```python
class GenerateArticleRequest(BaseModel):
    start_lesson: int
    end_lesson: int
    mode: str = "article"
    grade_id: str = "grade4"
    weighted_chars: dict[str, float] | None = None  # NEW
```

Update `generate_article_with_errors` signature:

```python
def generate_article_with_errors(
    start_lesson: int,
    end_lesson: int,
    mode: str = "article",
    grade_id: str = "grade4",
    weighted_chars: dict[str, float] | None = None,  # NEW
) -> dict:
```

Replace the `selected = random.sample(usable, num_wrong)` block:

```python
if weighted_chars:
    item_weights = [
        max(
            (weighted_chars.get(ch, 1.0) for _, ch in comp["_swappable"]),
            default=1.0,
        )
        for comp in usable
    ]
    selected = _weighted_sample_without_replacement(usable, item_weights, num_wrong)
else:
    selected = random.sample(usable, num_wrong)
```

Update the endpoint to pass through:

```python
@app.post("/api/generate", response_model=GenerateArticleResponse)
def generate_article(req: GenerateArticleRequest):
    info = get_grade_info(req.grade_id)
    if req.start_lesson < 1 or req.end_lesson > info["total_lessons"]:
        raise HTTPException(status_code=400, detail="Invalid lesson range")
    if req.start_lesson > req.end_lesson:
        raise HTTPException(status_code=400, detail="Start lesson must be <= end lesson")

    result = generate_article_with_errors(
        req.start_lesson, req.end_lesson, req.mode, req.grade_id, req.weighted_chars,
    )
    return result
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd backend && python -m pytest tests/test_generate.py -v`
Expected: 2 tests pass.

> **Note:** `test_weighted_chars_skews_selection` calls Gemini for sentence generation. If Gemini is unreachable in CI, the fallback path is used and the test still passes because the assertion only checks `wrong_chars` selection, not sentence quality.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_generate.py
git commit -m "feat(backend): generate endpoint accepts weighted_chars"
git push
```

### Task 3.3: Frontend `weights.ts`

**Files:**
- Create: `frontend/src/personalization/weights.ts`
- Create: `frontend/src/personalization/__tests__/weights.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/personalization/__tests__/weights.test.ts
import { describe, it, expect } from "vitest";
import { buildWeightedChars } from "../weights";
import type { CharStat } from "../../storage/types";

function stat(overrides: Partial<CharStat> & { char: string }): CharStat {
  return {
    profileId: "p",
    gradeId: "g",
    char: "",
    lesson: 1,
    lessonTitle: "L1",
    word: "x",
    attempts: 0,
    mistakes: 0,
    lastSeenAt: 0,
    lastMistakeAt: null,
    recentSuccessStreak: 0,
    mistakeRate: 0,
    updatedAt: 0,
    syncedAt: null,
    ...overrides,
  };
}

describe("buildWeightedChars", () => {
  it("excludes never-practiced (attempts=0) chars", () => {
    const result = buildWeightedChars([stat({ char: "a", attempts: 0 })]);
    expect(result).toEqual({});
  });

  it("excludes practiced + perfect + streak >= 2", () => {
    const result = buildWeightedChars([
      stat({ char: "a", attempts: 3, mistakes: 0, mistakeRate: 0, recentSuccessStreak: 2 }),
    ]);
    expect(result).toEqual({});
  });

  it("includes chars with mistakes", () => {
    const result = buildWeightedChars([
      stat({ char: "a", attempts: 2, mistakes: 1, mistakeRate: 0.5, recentSuccessStreak: 0 }),
    ]);
    expect(result["a"]).toBeCloseTo(2.5, 5);  // 1 + 0.5*3 = 2.5; decay 0.5^0 = 1
  });

  it("decays weight by recentSuccessStreak", () => {
    const result = buildWeightedChars([
      stat({ char: "a", attempts: 4, mistakes: 2, mistakeRate: 0.5, recentSuccessStreak: 2 }),
    ]);
    // boost = 1 + 0.5*3 = 2.5; decay = 0.5^2 = 0.25; product = 0.625 → floored to 1
    expect(result["a"]).toBe(1);
  });

  it("all wrong with streak 0 gets weight 4", () => {
    const result = buildWeightedChars([
      stat({ char: "a", attempts: 3, mistakes: 3, mistakeRate: 1, recentSuccessStreak: 0 }),
    ]);
    expect(result["a"]).toBeCloseTo(4, 5);
  });

  it("never returns below 1", () => {
    const result = buildWeightedChars([
      stat({ char: "a", attempts: 10, mistakes: 1, mistakeRate: 0.1, recentSuccessStreak: 5 }),
    ]);
    // boost 1.3, decay 0.03125, product 0.040625 → floored to 1
    expect(result["a"]).toBe(1);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && npm run test:run -- src/personalization/__tests__/weights.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `weights.ts`**

```ts
// src/personalization/weights.ts
import type { CharStat } from "../storage/types";

export function buildWeightedChars(stats: CharStat[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const s of stats) {
    if (s.attempts === 0) continue;
    if (s.mistakeRate === 0 && s.recentSuccessStreak >= 2) continue;
    const boost = 1 + s.mistakeRate * 3;
    const decay = Math.pow(0.5, s.recentSuccessStreak);
    result[s.char] = Math.max(1, boost * decay);
  }
  return result;
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test:run -- src/personalization/__tests__/weights.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/personalization/weights.ts frontend/src/personalization/__tests__/weights.test.ts
git commit -m "feat(personalization): build weighted_chars from CharStat list"
git push
```

### Task 3.4: `api.ts` accepts `weightedChars`

**Files:**
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Update `generateArticle` signature**

Replace the function in `frontend/src/api.ts`:

```ts
export async function generateArticle(
  startLesson: number,
  endLesson: number,
  mode: string = "article",
  gradeId: string = "grade4",
  weightedChars?: Record<string, number>,
): Promise<ArticleResponse> {
  const body: Record<string, unknown> = {
    start_lesson: startLesson,
    end_lesson: endLesson,
    mode,
    grade_id: gradeId,
  };
  if (weightedChars && Object.keys(weightedChars).length > 0) {
    body.weighted_chars = weightedChars;
  }
  const res = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to generate article");
  return res.json();
}
```

- [ ] **Step 2: Build check**

Run: `cd frontend && npm run build`
Expected: zero errors (existing callers don't pass `weightedChars`, optional param is OK).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.ts
git commit -m "feat(api): generateArticle accepts weightedChars"
git push
```

### Task 3.5: `ArticlePractice` builds weights before fetch

**Files:**
- Modify: `frontend/src/components/ArticlePractice.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { listByProfile as listCharStats } from "../storage/charStatsStore";
import { buildWeightedChars } from "../personalization/weights";
```

- [ ] **Step 2: Replace the existing `useEffect` that calls `generateArticle`**

```tsx
useEffect(() => {
  setLoading(true);
  (async () => {
    let weightedChars: Record<string, number> | undefined;
    if (personalization.enabled && personalization.activeProfile) {
      const stats = await listCharStats(personalization.activeProfile.id);
      // Only weight chars from the current grade — different grades have independent vocab
      const gradeStats = stats.filter((s) => s.gradeId === gradeId);
      const built = buildWeightedChars(gradeStats);
      if (Object.keys(built).length > 0) weightedChars = built;
    }
    try {
      const article = await generateArticle(startLesson, endLesson, practiceMode, gradeId, weightedChars);
      setArticle(article);
    } catch {
      alert("生成文章失敗，請重試");
    } finally {
      setLoading(false);
    }
  })();
}, [startLesson, endLesson, practiceMode, gradeId, personalization.enabled, personalization.activeProfile]);
```

- [ ] **Step 3: Build check**

Run: `cd frontend && npm run build`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ArticlePractice.tsx
git commit -m "feat(personalization): send weightedChars to generate API"
git push
```

### Task 3.6: Manual verification

- [ ] **Step 1: Start servers**

```bash
cd backend && uvicorn main:app --reload
cd frontend && npm run dev
```

- [ ] **Step 2: Verify weight payload is sent**

- Open DevTools → Network tab
- Enable personalization, pick a profile that already has charStats (from Phase 2 verification)
- Start a practice
- Inspect the `POST /api/generate` request body. Expect a `weighted_chars` object containing the chars that the profile previously got wrong.

- [ ] **Step 3: Soft verification of skew**

- Run a session, intentionally miss a specific char (e.g. 縫). End session.
- Start another session in the same lesson range. The 縫 char (or its compound) should appear more often than baseline — run 3-5 sessions to feel the trend.
- This is qualitative; the rigorous proof is in `test_weighted_chars_skews_selection`.

- [ ] **Step 4: Verify backward compat**

- Toggle personalization off, start a practice. `POST /api/generate` body should NOT contain `weighted_chars`. Behavior unchanged.

---

## Phase 4: Dashboard

> Phase 4 replaces the Phase 2 placeholder dashboard with the real implementation. Four widgets: stats cards, mistake trend chart, lesson progress grid, top mistakes list.

### Task 4.1: Dashboard data derivation helpers + tests

**Files:**
- Create: `frontend/src/dashboard/derive.ts`
- Create: `frontend/src/dashboard/__tests__/derive.test.ts`

> **Why a separate `derive.ts`?** Components should be thin. All the "from sessions → stats" math lives here so it's testable and reusable.

- [ ] **Step 1: Write failing test**

```ts
// src/dashboard/__tests__/derive.test.ts
import { describe, it, expect } from "vitest";
import {
  deriveOverallStats,
  deriveTrendPoints,
  deriveLessonGroups,
  countConsecutiveDays,
} from "../derive";
import type { Session } from "../../storage/types";

function session(o: Partial<Session> & { id: string; startedAt: number }): Session {
  return {
    id: o.id,
    profileId: "p",
    gradeId: "g",
    gradeLabel: "GLabel",
    startLesson: 1,
    endLesson: 3,
    mode: "article",
    startedAt: o.startedAt,
    finishedAt: o.startedAt + 1000,
    events: [],
    summary: { totalWrong: 5, foundCorrect: 4, falseAlarms: 1, missed: 0, accuracy: 0.66 },
    updatedAt: o.startedAt,
    syncedAt: null,
    ...o,
  };
}

describe("deriveOverallStats", () => {
  it("returns zeros for empty list", () => {
    expect(deriveOverallStats([])).toEqual({
      sessionCount: 0,
      totalFoundCorrect: 0,
      consecutiveDays: 0,
      avgAccuracy: 0,
    });
  });

  it("sums foundCorrect and averages accuracy", () => {
    const s = [
      session({ id: "1", startedAt: 1000, summary: { totalWrong: 5, foundCorrect: 4, falseAlarms: 0, missed: 1, accuracy: 0.8 } }),
      session({ id: "2", startedAt: 2000, summary: { totalWrong: 5, foundCorrect: 3, falseAlarms: 0, missed: 2, accuracy: 0.6 } }),
    ];
    const r = deriveOverallStats(s);
    expect(r.sessionCount).toBe(2);
    expect(r.totalFoundCorrect).toBe(7);
    expect(r.avgAccuracy).toBeCloseTo(0.7, 5);
  });
});

describe("countConsecutiveDays", () => {
  it("returns 0 for empty", () => {
    expect(countConsecutiveDays([])).toBe(0);
  });

  it("returns 1 when most recent is today", () => {
    const now = Date.now();
    expect(countConsecutiveDays([now])).toBe(1);
  });

  it("returns N for N consecutive days ending today", () => {
    const day = 86400_000;
    const now = Date.now();
    const ts = [now, now - day, now - 2 * day];
    expect(countConsecutiveDays(ts)).toBe(3);
  });

  it("breaks streak on gap", () => {
    const day = 86400_000;
    const now = Date.now();
    const ts = [now, now - day, now - 3 * day]; // gap of 2 days
    expect(countConsecutiveDays(ts)).toBe(2);
  });
});

describe("deriveTrendPoints", () => {
  it("returns one point per session in startedAt order", () => {
    const s = [
      session({ id: "2", startedAt: 2000, summary: { totalWrong: 5, foundCorrect: 3, falseAlarms: 0, missed: 2, accuracy: 0.6 } }),
      session({ id: "1", startedAt: 1000, summary: { totalWrong: 5, foundCorrect: 5, falseAlarms: 0, missed: 0, accuracy: 1.0 } }),
    ];
    const points = deriveTrendPoints(s);
    expect(points).toEqual([
      { startedAt: 1000, accuracy: 100 },
      { startedAt: 2000, accuracy: 60 },
    ]);
  });
});

describe("deriveLessonGroups", () => {
  it("groups sessions by gradeId/startLesson/endLesson", () => {
    const s = [
      session({ id: "1", startedAt: 1000, startLesson: 1, endLesson: 3, summary: { totalWrong: 5, foundCorrect: 4, falseAlarms: 0, missed: 1, accuracy: 0.8 } }),
      session({ id: "2", startedAt: 2000, startLesson: 1, endLesson: 3, summary: { totalWrong: 5, foundCorrect: 5, falseAlarms: 0, missed: 0, accuracy: 1.0 } }),
      session({ id: "3", startedAt: 3000, startLesson: 4, endLesson: 6, summary: { totalWrong: 5, foundCorrect: 3, falseAlarms: 0, missed: 2, accuracy: 0.6 } }),
    ];
    const groups = deriveLessonGroups(s);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      gradeId: "g",
      gradeLabel: "GLabel",
      startLesson: 1,
      endLesson: 3,
      sessionCount: 2,
      avgAccuracy: 0.9,
    });
    expect(groups[1].sessionCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && npm run test:run -- src/dashboard/__tests__/derive.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `derive.ts`**

```ts
// src/dashboard/derive.ts
import type { Session } from "../storage/types";

export interface OverallStats {
  sessionCount: number;
  totalFoundCorrect: number;
  consecutiveDays: number;
  avgAccuracy: number;
}

export interface TrendPoint {
  startedAt: number;
  accuracy: number; // 0-100 (percent)
}

export interface LessonGroup {
  gradeId: string;
  gradeLabel: string;
  startLesson: number;
  endLesson: number;
  sessionCount: number;
  avgAccuracy: number;
  lastPracticedAt: number;
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function countConsecutiveDays(timestamps: number[]): number {
  if (timestamps.length === 0) return 0;
  const days = new Set(timestamps.map(startOfLocalDay));
  const today = startOfLocalDay(Date.now());
  if (!days.has(today)) return 0;
  let count = 0;
  let cursor = today;
  const DAY = 86400_000;
  while (days.has(cursor)) {
    count++;
    cursor -= DAY;
  }
  return count;
}

export function deriveOverallStats(sessions: Session[]): OverallStats {
  if (sessions.length === 0) {
    return { sessionCount: 0, totalFoundCorrect: 0, consecutiveDays: 0, avgAccuracy: 0 };
  }
  let totalFoundCorrect = 0;
  let accSum = 0;
  for (const s of sessions) {
    totalFoundCorrect += s.summary.foundCorrect;
    accSum += s.summary.accuracy;
  }
  return {
    sessionCount: sessions.length,
    totalFoundCorrect,
    consecutiveDays: countConsecutiveDays(sessions.map((s) => s.startedAt)),
    avgAccuracy: accSum / sessions.length,
  };
}

export function deriveTrendPoints(sessions: Session[]): TrendPoint[] {
  return [...sessions]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => ({ startedAt: s.startedAt, accuracy: Math.round(s.summary.accuracy * 100) }));
}

export function deriveLessonGroups(sessions: Session[]): LessonGroup[] {
  const map = new Map<string, LessonGroup>();
  for (const s of sessions) {
    const key = `${s.gradeId}|${s.startLesson}|${s.endLesson}`;
    let g = map.get(key);
    if (!g) {
      g = {
        gradeId: s.gradeId,
        gradeLabel: s.gradeLabel,
        startLesson: s.startLesson,
        endLesson: s.endLesson,
        sessionCount: 0,
        avgAccuracy: 0,
        lastPracticedAt: 0,
      };
      map.set(key, g);
    }
    const prevTotal = g.avgAccuracy * g.sessionCount;
    g.sessionCount += 1;
    g.avgAccuracy = (prevTotal + s.summary.accuracy) / g.sessionCount;
    if (s.startedAt > g.lastPracticedAt) g.lastPracticedAt = s.startedAt;
  }
  return Array.from(map.values()).sort((a, b) => b.lastPracticedAt - a.lastPracticedAt);
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test:run -- src/dashboard/__tests__/derive.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/dashboard/derive.ts frontend/src/dashboard/__tests__/derive.test.ts
git commit -m "feat(dashboard): pure data derivation helpers"
git push
```

### Task 4.2: `StatsCards.tsx`

**Files:**
- Create: `frontend/src/dashboard/StatsCards.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/dashboard/StatsCards.tsx
import type { OverallStats } from "./derive";

export default function StatsCards({ stats }: { stats: OverallStats }) {
  return (
    <div className="stats-cards">
      <div className="stats-card">
        <div className="stats-number">{stats.sessionCount}</div>
        <div className="stats-label">練習次數</div>
      </div>
      <div className="stats-card">
        <div className="stats-number">{stats.totalFoundCorrect}</div>
        <div className="stats-label">寫對字數</div>
      </div>
      <div className="stats-card">
        <div className="stats-number">{stats.consecutiveDays}</div>
        <div className="stats-label">連續天數</div>
      </div>
      <div className="stats-card">
        <div className="stats-number">{Math.round(stats.avgAccuracy * 100)}%</div>
        <div className="stats-label">平均正確率</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append styles to `index.css`**

```css
.stats-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin: 16px 0;
}
@media (max-width: 600px) {
  .stats-cards { grid-template-columns: repeat(2, 1fr); }
}
.stats-card {
  background: white;
  border-radius: 16px;
  padding: 16px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.stats-number {
  font-size: 28px;
  font-weight: bold;
  color: var(--coral, #ff6b6b);
}
.stats-label {
  font-size: 13px;
  color: #888;
  margin-top: 4px;
}
```

- [ ] **Step 3: Commit (will be exercised in Task 4.6)**

```bash
git add frontend/src/dashboard/StatsCards.tsx frontend/src/index.css
git commit -m "feat(dashboard): StatsCards widget"
git push
```

### Task 4.3: `MistakeTrendChart.tsx`

**Files:**
- Create: `frontend/src/dashboard/MistakeTrendChart.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/dashboard/MistakeTrendChart.tsx
import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { TrendPoint } from "./derive";

type Window = "recent7" | "recent30days" | "all";

const DAY = 86400_000;

function filterPoints(points: TrendPoint[], window: Window): TrendPoint[] {
  if (window === "all") return points;
  if (window === "recent7") return points.slice(-7);
  const cutoff = Date.now() - 30 * DAY;
  return points.filter((p) => p.startedAt >= cutoff);
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function MistakeTrendChart({ points }: { points: TrendPoint[] }) {
  const [window, setWindow] = useState<Window>("recent7");
  const filtered = filterPoints(points, window);

  return (
    <div className="trend-chart-card">
      <div className="trend-chart-header">
        <h3>正確率趨勢</h3>
        <select value={window} onChange={(e) => setWindow(e.target.value as Window)}>
          <option value="recent7">近 7 次</option>
          <option value="recent30days">近 30 天</option>
          <option value="all">全部</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <p className="empty-hint">還沒有資料，再多練幾次就會看到趨勢圖!</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={filtered} margin={{ top: 12, right: 12, bottom: 12, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="startedAt" tickFormatter={formatDate} fontSize={12} />
            <YAxis domain={[0, 100]} fontSize={12} unit="%" />
            <Tooltip
              labelFormatter={(ts: number) => new Date(ts).toLocaleString()}
              formatter={(val: number) => [`${val}%`, "正確率"]}
            />
            <Line type="monotone" dataKey="accuracy" stroke="#ff6b6b" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Append styles**

```css
.trend-chart-card {
  background: white;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  margin: 16px 0;
}
.trend-chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.trend-chart-header h3 {
  margin: 0;
}
.trend-chart-header select {
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-family: inherit;
}
.empty-hint {
  text-align: center;
  color: #999;
  padding: 24px;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/dashboard/MistakeTrendChart.tsx frontend/src/index.css
git commit -m "feat(dashboard): MistakeTrendChart widget"
git push
```

### Task 4.4: `LessonProgressGrid.tsx`

**Files:**
- Create: `frontend/src/dashboard/LessonProgressGrid.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/dashboard/LessonProgressGrid.tsx
import type { LessonGroup } from "./derive";

function starRating(accuracy: number): string {
  const filled = Math.round(accuracy * 5);
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

export default function LessonProgressGrid({ groups }: { groups: LessonGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="lesson-progress-card">
        <h3>已做課文</h3>
        <p className="empty-hint">完成第一次練習後，這裡會出現你做過的課文。</p>
      </div>
    );
  }
  return (
    <div className="lesson-progress-card">
      <h3>已做課文</h3>
      <div className="lesson-progress-grid">
        {groups.map((g) => (
          <div className="lesson-card" key={`${g.gradeId}-${g.startLesson}-${g.endLesson}`}>
            <div className="lesson-card-title">
              {g.gradeLabel} 第{g.startLesson}–{g.endLesson}課
            </div>
            <div className="lesson-card-stars">{starRating(g.avgAccuracy)}</div>
            <div className="lesson-card-meta">
              練 {g.sessionCount} 次 · 正確率 {Math.round(g.avgAccuracy * 100)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append styles**

```css
.lesson-progress-card {
  background: white;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  margin: 16px 0;
}
.lesson-progress-card h3 {
  margin-top: 0;
}
.lesson-progress-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.lesson-card {
  background: var(--cream, #fff8ec);
  padding: 12px;
  border-radius: 12px;
}
.lesson-card-title {
  font-weight: 600;
  font-size: 14px;
}
.lesson-card-stars {
  color: #ffa94d;
  margin: 4px 0;
}
.lesson-card-meta {
  font-size: 12px;
  color: #888;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/dashboard/LessonProgressGrid.tsx frontend/src/index.css
git commit -m "feat(dashboard): LessonProgressGrid widget"
git push
```

### Task 4.5: `TopMistakesList.tsx`

**Files:**
- Create: `frontend/src/dashboard/TopMistakesList.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/dashboard/TopMistakesList.tsx
import { useEffect, useState } from "react";
import type { CharStat, HandwritingImage } from "../storage/types";
import { listByProfile as listImagesByProfile } from "../storage/imageStore";

interface Props {
  profileId: string;
  topChars: CharStat[];
}

export default function TopMistakesList({ profileId, topChars }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [images, setImages] = useState<HandwritingImage[]>([]);

  useEffect(() => {
    listImagesByProfile(profileId).then(setImages);
  }, [profileId]);

  if (topChars.length === 0) {
    return (
      <div className="top-mistakes-card">
        <h3>最常寫錯的字 Top 10</h3>
        <p className="empty-hint">還沒寫錯字，繼續加油!</p>
      </div>
    );
  }

  return (
    <div className="top-mistakes-card">
      <h3>最常寫錯的字 Top 10</h3>
      <ol className="top-mistakes-list">
        {topChars.map((s) => {
          const charImages = images.filter((i) => i.char === s.char).slice(0, 6);
          return (
            <li key={s.char} className="top-mistake-item">
              <div className="top-mistake-row">
                <span className="top-mistake-char">{s.char}</span>
                <span className="top-mistake-stats">
                  錯 {s.mistakes} / 練 {s.attempts} 次 ({Math.round(s.mistakeRate * 100)}%)
                </span>
                <span className="top-mistake-lesson">
                  第{s.lesson}課 {s.lessonTitle}
                </span>
                <button
                  className="top-mistake-toggle"
                  onClick={() => setExpanded(expanded === s.char ? null : s.char)}
                >
                  {expanded === s.char ? "收起" : "看手寫"}
                </button>
              </div>
              {expanded === s.char && (
                <div className="top-mistake-thumbnails">
                  {charImages.length === 0 ? (
                    <p className="empty-hint">沒有保留手寫圖（可能已過期）</p>
                  ) : (
                    charImages.map((img) => (
                      <img key={img.id} src={img.imageData} alt={`${s.char} 手寫`} title={new Date(img.capturedAt).toLocaleString()} />
                    ))
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

- [ ] **Step 2: Append styles**

```css
.top-mistakes-card {
  background: white;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  margin: 16px 0;
}
.top-mistakes-card h3 {
  margin-top: 0;
}
.top-mistakes-list {
  list-style: decimal inside;
  padding: 0;
  margin: 0;
}
.top-mistake-item {
  padding: 8px 0;
  border-bottom: 1px dashed #eee;
}
.top-mistake-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.top-mistake-char {
  font-size: 24px;
  font-weight: bold;
  color: var(--coral, #ff6b6b);
}
.top-mistake-stats {
  font-size: 13px;
  color: #555;
}
.top-mistake-lesson {
  font-size: 12px;
  color: #888;
}
.top-mistake-toggle {
  margin-left: auto;
  padding: 4px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}
.top-mistake-thumbnails {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.top-mistake-thumbnails img {
  width: 48px;
  height: 48px;
  border: 1px solid #eee;
  border-radius: 4px;
  object-fit: contain;
  background: white;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/dashboard/TopMistakesList.tsx frontend/src/index.css
git commit -m "feat(dashboard): TopMistakesList widget with expandable handwriting thumbnails"
git push
```

### Task 4.6: `Dashboard.tsx` composition + integration

**Files:**
- Create: `frontend/src/dashboard/Dashboard.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Implement `Dashboard.tsx`**

```tsx
// src/dashboard/Dashboard.tsx
import { useEffect, useState } from "react";
import { usePersonalization } from "../personalization/PersonalizationContext";
import { listByProfile as listSessions } from "../storage/sessionStore";
import { listTopMistakes } from "../storage/charStatsStore";
import { deriveOverallStats, deriveTrendPoints, deriveLessonGroups, type OverallStats, type TrendPoint, type LessonGroup } from "./derive";
import type { CharStat } from "../storage/types";
import StatsCards from "./StatsCards";
import MistakeTrendChart from "./MistakeTrendChart";
import LessonProgressGrid from "./LessonProgressGrid";
import TopMistakesList from "./TopMistakesList";

export default function Dashboard({ onBack }: { onBack: () => void }) {
  const { activeProfile, profiles, setActiveProfile } = usePersonalization();
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [topChars, setTopChars] = useState<CharStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeProfile) return;
    setLoading(true);
    (async () => {
      const [sessions, top] = await Promise.all([
        listSessions(activeProfile.id),
        listTopMistakes(activeProfile.id, 10),
      ]);
      setStats(deriveOverallStats(sessions));
      setTrend(deriveTrendPoints(sessions));
      setGroups(deriveLessonGroups(sessions));
      setTopChars(top);
      setLoading(false);
    })();
  }, [activeProfile]);

  if (!activeProfile) {
    return (
      <div className="dashboard-container">
        <button className="back-btn" onClick={onBack}>← 返回</button>
        <p>請先選一位小朋友。</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <button className="back-btn" onClick={onBack}>← 返回</button>
        <h2>
          {activeProfile.emoji} {activeProfile.name} 的學習紀錄
        </h2>
        {profiles.length > 1 && (
          <select
            value={activeProfile.id}
            onChange={(e) => setActiveProfile(e.target.value)}
            className="profile-switcher"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.emoji} {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading || !stats ? (
        <div className="loader">載入中…</div>
      ) : (
        <>
          <StatsCards stats={stats} />
          <MistakeTrendChart points={trend} />
          <LessonProgressGrid groups={groups} />
          <TopMistakesList profileId={activeProfile.id} topChars={topChars} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Append styles**

```css
.dashboard-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 16px;
}
.dashboard-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.dashboard-header h2 {
  flex: 1;
  margin: 0;
}
.profile-switcher {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-family: inherit;
}
```

- [ ] **Step 3: Replace placeholder Dashboard in `App.tsx`**

In `App.tsx`, add import:

```tsx
import Dashboard from "./dashboard/Dashboard";
```

Replace the `{stage === "dashboard" && (...)}` block with:

```tsx
{stage === "dashboard" && <Dashboard onBack={handleBack} />}
```

- [ ] **Step 4: Build check**

Run: `cd frontend && npm run build`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/dashboard/Dashboard.tsx frontend/src/App.tsx frontend/src/index.css
git commit -m "feat(dashboard): Dashboard composition + App integration"
git push
```

### Task 4.7: Manual verification of dashboard

- [ ] **Step 1: Run dev servers**

- [ ] **Step 2: Make sure you have ≥ 3 sessions for one profile**

Complete 3-5 practice sessions with different outcomes (some perfect, some with mistakes).

- [ ] **Step 3: Click 📊 — verify all four widgets render**

Expected:
- 4 stats cards with non-zero numbers
- Trend chart with one dot per session
- Lesson progress grid with one card per `(gradeId, startLesson, endLesson)` combo
- Top mistakes list, ordered by mistake rate

- [ ] **Step 4: Expand a top-mistake row — verify handwriting thumbnails appear**

- [ ] **Step 5: Switch between profiles via the dropdown — verify each profile's stats refresh and are isolated**

- [ ] **Step 6: With a brand-new profile (no sessions), open dashboard — all widgets show empty states**

---

## Phase 5: Quota / TTL

> Phase 5 hardens the storage layer for long-term use. Auto-purge images older than 4 months on app start, check quota before writing each image, manual cleanup button, and a "don't store images anymore" persistent flag.

### Task 5.1: TTL configuration + auto-purge on mount

**Files:**
- Modify: `frontend/src/storage/imageStore.ts`
- Create: `frontend/src/personalization/__tests__/ttl.test.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add a TTL constant + `purgeOlderThanFourMonths` helper to `imageStore.ts`**

Append to `frontend/src/storage/imageStore.ts`:

```ts
export const TTL_DAYS = 120;  // 4 months
const DAY_MS = 86400_000;

export async function purgeOlderThanFourMonths(now: number = Date.now()): Promise<number> {
  const cutoff = now - TTL_DAYS * DAY_MS;
  return purgeBefore(cutoff);
}
```

- [ ] **Step 2: Write failing test**

```ts
// src/personalization/__tests__/ttl.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { DB_NAME, closeDB } from "../../storage/db";
import { putImage, listByProfile, purgeOlderThanFourMonths, TTL_DAYS } from "../../storage/imageStore";

beforeEach(async () => {
  closeDB();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

const DAY = 86400_000;

describe("purgeOlderThanFourMonths", () => {
  it("deletes images older than 120 days, keeps newer ones", async () => {
    const now = Date.now();
    await putImage({ profileId: "p1", sessionId: "s", char: "a",
      capturedAt: now - (TTL_DAYS + 5) * DAY, imageData: "x" });
    await putImage({ profileId: "p1", sessionId: "s", char: "b",
      capturedAt: now - (TTL_DAYS - 5) * DAY, imageData: "x" });
    const deleted = await purgeOlderThanFourMonths(now);
    expect(deleted).toBe(1);
    const remaining = await listByProfile("p1");
    expect(remaining.map((i) => i.char)).toEqual(["b"]);
  });

  it("returns 0 when nothing to purge", async () => {
    const now = Date.now();
    await putImage({ profileId: "p1", sessionId: "s", char: "a",
      capturedAt: now, imageData: "x" });
    expect(await purgeOlderThanFourMonths(now)).toBe(0);
  });
});
```

- [ ] **Step 3: Run test, verify PASS** (implementation is in step 1)

Run: `cd frontend && npm run test:run -- src/personalization/__tests__/ttl.test.ts`
Expected: 2 tests pass.

- [ ] **Step 4: Call `purgeOlderThanFourMonths` on App mount**

In `frontend/src/App.tsx`, add:

```tsx
import { useEffect } from "react";
import { purgeOlderThanFourMonths } from "./storage/imageStore";
```

Inside the `App` component (after the existing `useState` hooks):

```tsx
useEffect(() => {
  purgeOlderThanFourMonths().catch((err) => console.warn("TTL purge failed", err));
}, []);
```

- [ ] **Step 5: Build check**

Run: `cd frontend && npm run build`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/storage/imageStore.ts frontend/src/personalization/__tests__/ttl.test.ts frontend/src/App.tsx
git commit -m "feat(storage): auto-purge handwriting images older than 4 months on app start"
git push
```

### Task 5.2: Quota check inside `recordSession` + "skip-images" flag

**Files:**
- Modify: `frontend/src/storage/sessionStore.ts`
- Modify: `frontend/src/storage/__tests__/sessionStore.test.ts`
- Create: `frontend/src/storage/skipImagesFlag.ts`

- [ ] **Step 1: Implement persistent "skip-images" flag**

```ts
// src/storage/skipImagesFlag.ts
export const SKIP_IMAGES_KEY = "rightwrite:personalization:skipImages";

export function isSkippingImages(): boolean {
  return localStorage.getItem(SKIP_IMAGES_KEY) === "true";
}

export function setSkippingImages(v: boolean): void {
  if (v) localStorage.setItem(SKIP_IMAGES_KEY, "true");
  else localStorage.removeItem(SKIP_IMAGES_KEY);
}
```

- [ ] **Step 2: Add failing test in `sessionStore.test.ts`**

Append:

```ts
import { setSkippingImages } from "../skipImagesFlag";

describe("recordSession respects skip-images flag", () => {
  it("does NOT persist images when flag is on, but still persists session + charStats", async () => {
    setSkippingImages(true);
    try {
      const events: PracticeEvent[] = [
        ev({ type: "found_wrong", correctChar: "縫", isCorrect: false, imageData: "data:img1" }),
      ];
      await recordSession({ ...baseSession, events });
      expect((await listImagesByProfile("p1")).length).toBe(0);
      expect((await getStat("p1", "4_kangxuan", "縫"))!.attempts).toBe(1);
    } finally {
      setSkippingImages(false);
    }
  });
});
```

- [ ] **Step 3: Run test, verify FAIL** (current `recordSession` always writes images)

Run: `cd frontend && npm run test:run -- src/storage/__tests__/sessionStore.test.ts`
Expected: the new test fails.

- [ ] **Step 4: Update `recordSession` to honor the flag**

In `frontend/src/storage/sessionStore.ts`, add import:

```ts
import { isSkippingImages } from "./skipImagesFlag";
```

Replace the `if (e.imageData) { ... }` block:

```ts
if (e.imageData && !isSkippingImages()) {
  await putImage({
    profileId: input.profileId,
    sessionId: id,
    char: e.correctChar,
    capturedAt: input.finishedAt,
    imageData: e.imageData,
  });
}
```

- [ ] **Step 5: Run test, verify PASS**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/sessionStore.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/storage/skipImagesFlag.ts frontend/src/storage/sessionStore.ts \
        frontend/src/storage/__tests__/sessionStore.test.ts
git commit -m "feat(storage): respect persistent skip-images flag in recordSession"
git push
```

### Task 5.3: `QuotaModal.tsx` warning UI

**Files:**
- Create: `frontend/src/personalization/QuotaModal.tsx`
- Modify: `frontend/src/components/ArticlePractice.tsx`
- Modify: `frontend/src/storage/sessionStore.ts`

> **Strategy:** Don't pop the modal mid-`recordSession` — that would block the result transition. Instead, `recordSession` returns a `quotaState` field; the caller (ArticlePractice) shows the modal AFTER the result has been displayed.

- [ ] **Step 1: Extend `recordSession` return**

In `frontend/src/storage/sessionStore.ts`, add import:

```ts
import { ensureRoomForImage } from "./quota";
```

Modify return type and logic. Replace function with:

```ts
export interface RecordSessionResult {
  session: Session;
  quotaState: "ok" | "warn" | "block";
  imagesSkipped: number;
}

export async function recordSession(input: RecordSessionInput): Promise<RecordSessionResult> {
  const id = crypto.randomUUID();
  const session: Session = {
    id,
    profileId: input.profileId,
    gradeId: input.gradeId,
    gradeLabel: input.gradeLabel,
    startLesson: input.startLesson,
    endLesson: input.endLesson,
    mode: input.mode,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    events: input.events,
    summary: summarize(input.events),
    updatedAt: Date.now(),
    syncedAt: null,
  };
  const db = await getDB();
  await db.put("sessions", session);

  let worstQuota: "ok" | "warn" | "block" = "ok";
  let imagesSkipped = 0;
  const skip = isSkippingImages();

  for (const e of input.events) {
    await applyEvent({
      profileId: input.profileId,
      gradeId: input.gradeId,
      timestamp: input.finishedAt,
      event: e,
    });
    if (!e.imageData) continue;
    if (skip) { imagesSkipped++; continue; }
    const estimate = Math.ceil(e.imageData.length * 0.75); // base64 → bytes
    const state = await ensureRoomForImage(estimate);
    if (state === "block") { imagesSkipped++; worstQuota = "block"; continue; }
    if (state === "warn" && worstQuota === "ok") worstQuota = "warn";
    await putImage({
      profileId: input.profileId,
      sessionId: id,
      char: e.correctChar,
      capturedAt: input.finishedAt,
      imageData: e.imageData,
    });
  }

  return { session, quotaState: worstQuota, imagesSkipped };
}
```

> Update existing test signatures: `recordSession` now returns `{ session, quotaState, imagesSkipped }`. Adjust any call sites — the Phase 1 sessionStore.test cases need `const { session } = await recordSession(...)`.

- [ ] **Step 2: Update Phase 1 test call sites for the new return**

In `frontend/src/storage/__tests__/sessionStore.test.ts`, change every:

```ts
const session = await recordSession(...);
```

to:

```ts
const { session } = await recordSession(...);
```

And ensure the rest of the assertions remain valid (they still check `session.id`, etc.).

- [ ] **Step 3: Run sessionStore tests, verify pass**

Run: `cd frontend && npm run test:run -- src/storage/__tests__/sessionStore.test.ts`
Expected: all tests pass.

- [ ] **Step 4: Implement `QuotaModal.tsx`**

```tsx
// src/personalization/QuotaModal.tsx
import { useEffect, useState } from "react";
import { getEstimate, type StorageEstimate } from "../storage/quota";
import { purgeOlderThanFourMonths } from "../storage/imageStore";
import { setSkippingImages } from "../storage/skipImagesFlag";

interface Props {
  open: boolean;
  onClose: () => void;
}

function fmtMB(bytes: number): string {
  return (bytes / 1_048_576).toFixed(1) + " MB";
}

export default function QuotaModal({ open, onClose }: Props) {
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) getEstimate().then(setEstimate);
  }, [open]);

  if (!open) return null;

  const handlePurge = async () => {
    setBusy(true);
    try {
      const deleted = await purgeOlderThanFourMonths();
      alert(`已釋出空間，刪除了 ${deleted} 張舊手寫圖。`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = () => {
    setSkippingImages(true);
    alert("已停止儲存新的手寫圖。原本的紀錄仍會保留。");
    onClose();
  };

  return (
    <div className="quota-modal" role="dialog">
      <div className="quota-modal-content">
        <h3>⚠️ iPad 上儲存空間快滿了</h3>
        {estimate && (
          <p>
            目前已佔用 <strong>{fmtMB(estimate.usage)}</strong> / {fmtMB(estimate.quota)} (
            {Math.round(estimate.pct * 100)}%)
          </p>
        )}
        <div className="quota-modal-actions">
          <button className="primary" onClick={handlePurge} disabled={busy}>
            {busy ? "清理中…" : "清掉 4 個月前的資料"}
          </button>
          <button onClick={handleSkip} disabled={busy}>
            先別清，不再儲手寫圖
          </button>
          <button onClick={onClose} disabled={busy}>
            稍後再說
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Append styles**

```css
.quota-modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.quota-modal-content {
  background: white;
  padding: 24px;
  border-radius: 16px;
  max-width: 420px;
}
.quota-modal-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}
.quota-modal-actions button {
  padding: 10px 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  font-family: inherit;
}
.quota-modal-actions button.primary {
  background: var(--coral, #ff6b6b);
  color: white;
  border-color: var(--coral, #ff6b6b);
}
```

- [ ] **Step 6: Wire modal into `ArticlePractice`**

In `frontend/src/components/ArticlePractice.tsx`:

Add state:
```tsx
const [showQuotaModal, setShowQuotaModal] = useState(false);
```

Update `handleFinish` to inspect the result:
```tsx
if (personalization.enabled && personalization.activeProfile) {
  // ... build events as before
  try {
    const result = await recordSession({ ... });
    if (result.quotaState === "block" || result.quotaState === "warn") {
      setShowQuotaModal(true);
    }
  } catch (err) {
    console.error("Failed to record session", err);
  }
}
```

Add modal at the end of the JSX return:
```tsx
{showQuotaModal && (
  <QuotaModal open={showQuotaModal} onClose={() => setShowQuotaModal(false)} />
)}
```

Import:
```tsx
import QuotaModal from "../personalization/QuotaModal";
```

> **Note:** The modal triggers before `onFinish(allResults)`. To not block the result transition, restructure so `onFinish` is called first, modal renders on top of `ResultView`. Move `setShowQuotaModal(true)` AFTER `onFinish(allResults)` — and lift the modal up to `App.tsx` if cleaner. For Phase 5 simplicity, render it inside `ArticlePractice` is acceptable since the user clicks "結束練習" and the practice component remains mounted briefly before the parent unmounts. Confirm during manual verification (Task 5.6); if it doesn't appear, lift to `App.tsx`.

- [ ] **Step 7: Build check**

Run: `cd frontend && npm run build`
Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/personalization/QuotaModal.tsx \
        frontend/src/storage/sessionStore.ts \
        frontend/src/storage/__tests__/sessionStore.test.ts \
        frontend/src/components/ArticlePractice.tsx \
        frontend/src/index.css
git commit -m "feat(personalization): quota warning modal triggered after session record"
git push
```

### Task 5.4: "清理 4 個月前資料" button in settings dropdown

**Files:**
- Modify: `frontend/src/components/LessonSelector.tsx`

- [ ] **Step 1: Add the button**

In the `settings-dropdown` JSX block from Task 2.6, append below the toggle:

```tsx
{personalization.enabled && (
  <>
    <button
      className="settings-action"
      onClick={async () => {
        const deleted = await purgeOlderThanFourMonths();
        alert(`已刪除 ${deleted} 張 4 個月前的手寫圖`);
      }}
    >
      🗑️ 清理 4 個月前資料
    </button>
    <button
      className="settings-action"
      onClick={() => {
        const next = !skipImages;
        setSkippingImages(next);
        setSkipImagesState(next);
        alert(next ? "停止儲存新的手寫圖（既有資料保留）" : "重新開始儲存手寫圖");
      }}
    >
      {skipImages ? "✅ 開始儲存手寫圖" : "🚫 不再儲存手寫圖"}
    </button>
  </>
)}
```

Add imports + local state to `LessonSelector.tsx`:
```tsx
import { purgeOlderThanFourMonths } from "../storage/imageStore";
import { isSkippingImages, setSkippingImages } from "../storage/skipImagesFlag";

// Inside the component, alongside existing useState calls:
const [skipImages, setSkipImagesState] = useState<boolean>(() => isSkippingImages());
```

- [ ] **Step 2: Style the action buttons**

Append to `index.css`:

```css
.settings-action {
  display: block;
  width: 100%;
  padding: 8px 12px;
  margin-top: 8px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: 13px;
}
.settings-action:hover {
  background: var(--cream, #fff8ec);
}
```

- [ ] **Step 3: Build check + commit**

```bash
cd frontend && npm run build
git add frontend/src/components/LessonSelector.tsx frontend/src/index.css
git commit -m "feat(personalization): manual cleanup actions in settings dropdown"
git push
```

### Task 5.5: Manual verification

- [ ] **Step 1: Verify TTL on mount**

- Open DevTools → Application → IndexedDB → `handwritingImages`. Manually edit one entry's `capturedAt` to a value > 120 days ago.
- Reload the app.
- Confirm the entry is gone.

- [ ] **Step 2: Verify quota modal trigger**

- Open DevTools → Application → IndexedDB → simulate near-full quota by repeatedly running sessions or by stubbing `navigator.storage.estimate` in console:
  ```js
  navigator.storage.estimate = async () => ({ usage: 4_500_000, quota: 5_000_000 });
  ```
- Complete a practice. Verify modal appears.

- [ ] **Step 3: Verify "清掉 4 個月前的資料" button purges**

- [ ] **Step 4: Verify "不再儲手寫圖" persists across reloads**

- Click the button. Reload page. Complete a practice with handwriting. Check IndexedDB — `handwritingImages` should NOT gain new entries.
- Click again to re-enable. Verify new images persist again.

- [ ] **Step 5: Verify the modal doesn't appear when quota is < 80%**

- Reset the navigator stub (or refresh). Complete a session. Modal should not appear.

---

## Phase 6: Wrap-up

### Task 6.1: Run full test suites

- [ ] **Step 1: Run frontend tests**

Run: `cd frontend && npm run test:run`
Expected: all tests pass.

- [ ] **Step 2: Run backend tests**

Run: `cd backend && python -m pytest tests/ -v`
Expected: all tests pass.

### Task 6.2: Lint + build

- [ ] **Step 1: Frontend lint**

Run: `cd frontend && npm run lint`
Expected: zero errors. (Existing project lint config is preserved.)

- [ ] **Step 2: Frontend build**

Run: `cd frontend && npm run build`
Expected: zero errors, output in `backend/static/`.

- [ ] **Step 3: If lint or build fails, fix and re-run**

### Task 6.3: Open pull request

- [ ] **Step 1: Confirm `git log` shows tidy commit history per phase**

Run: `git log --oneline main..HEAD`
Expected: ~30 commits, all with `feat(...) / chore / build / docs` prefixes.

- [ ] **Step 2: Open PR with title and body**

```bash
gh pr create --title "feat: personalization — per-profile tracking, weighted review, dashboard" \
  --body "$(cat <<'EOF'
## Summary
- Add multi-profile personalization (default off, toggle in ⚙️ settings)
- Per-profile mistake tracking with weighted-random review via `/api/generate weighted_chars`
- Learning dashboard: stats cards, mistake trend chart, lesson progress grid, top mistakes
- IndexedDB storage with 4-month TTL, quota warning modal, manual cleanup
- Hooks for future cloud sync (paid tier): `updatedAt` + `syncedAt` on every record

Spec: `docs/superpowers/specs/2026-05-23-personalization-design.md`
Plan: `docs/superpowers/plans/2026-05-23-personalization.md`

## Test plan
- [ ] All vitest tests pass: `cd frontend && npm run test:run`
- [ ] All pytest tests pass: `cd backend && python -m pytest tests/ -v`
- [ ] Frontend builds: `cd frontend && npm run build`
- [ ] Manual: personalization off — no IndexedDB writes
- [ ] Manual: create profile, complete practice, see entries in DevTools IndexedDB
- [ ] Manual: dashboard shows after ≥ 1 session
- [ ] Manual: weighted_chars sent on POST /api/generate when profile has history
- [ ] Manual: TTL purge fires on mount (force old timestamp, reload)
- [ ] Manual: quota modal triggers when navigator.storage.estimate is stubbed to > 80%

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Spec Self-Review Summary

Cross-checked plan against `docs/superpowers/specs/2026-05-23-personalization-design.md`:

| Spec section                          | Covered by                                       |
| ------------------------------------- | ------------------------------------------------ |
| §1 目標與範圍                          | Plan goal + architecture                         |
| §2 整體流程與 UI 入口                  | Phase 2 (toggle, ⚙️, profile picker, dashboard 入口) |
| §3 資料模型 (4 stores)                | Phase 1 tasks 1.1–1.6                            |
| §3.5 雙寫一致性                        | Task 1.6 `recordSession`                         |
| §4 加權邏輯                            | Phase 3 (weights.ts + backend `_weighted_sample`) |
| §5 Dashboard 4 區塊                    | Phase 4 (4 widgets + derive helpers)             |
| §6 Quota / TTL                         | Phase 5 (purge, ensureRoom, modal, skip-flag, cleanup button) |
| §7 模組拆分                            | File Structure section + per-task `Files:`      |
| §8 測試策略                            | Phase 0 setup + every task's failing-test step  |
| §9 分階段交付                          | Phases 1–5 map 1:1                               |
| §10 雲同步留鉤                         | `updatedAt`/`syncedAt` in types.ts (Task 1.1)   |

No gaps. No placeholders. Type names match across tasks: `Profile`, `Session`, `CharStat`, `HandwritingImage`, `PracticeEvent`, `AnswerResult`, `RecordSessionResult`, `OverallStats`, `TrendPoint`, `LessonGroup`.





