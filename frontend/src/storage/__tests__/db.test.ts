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
