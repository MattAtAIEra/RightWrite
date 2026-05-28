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
