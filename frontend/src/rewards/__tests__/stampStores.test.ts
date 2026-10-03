// src/rewards/__tests__/stampStores.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { DB_NAME, closeDB } from "../../storage/db";
import { addStamps, countUnredeemed, listStamps, redeemStamps } from "../../storage/stampStore";
import { clearPin, getParentSettings, saveParentSettings, setPin, verifyPin, activeReward } from "../../storage/parentStore";

const PROFILE = "p1";

beforeEach(async () => {
  closeDB();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

function fresh(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    profileId: PROFILE,
    type: "perfect" as const,
    scopeKey: `s${i}`,
    sessionId: `s${i}`,
    earnedAt: 1000 + i,
  }));
}

describe("stampStore", () => {
  it("adds and lists stamps oldest-first", async () => {
    await addStamps(fresh(3));
    const all = await listStamps(PROFILE);
    expect(all).toHaveLength(3);
    expect(all[0].earnedAt).toBeLessThan(all[2].earnedAt);
    expect(await countUnredeemed(PROFILE)).toBe(3);
  });

  it("redeems the oldest n stamps only", async () => {
    await addStamps(fresh(5));
    const consumed = await redeemStamps(PROFILE, "r1", 3);
    expect(consumed).toBe(3);
    const all = await listStamps(PROFILE);
    expect(all.filter((s) => s.redeemedRewardId === "r1").map((s) => s.earnedAt)).toEqual([1000, 1001, 1002]);
    expect(await countUnredeemed(PROFILE)).toBe(2);
  });
});

describe("parentStore", () => {
  it("returns defaults when unset", async () => {
    const s = await getParentSettings(PROFILE);
    expect(s.weeklySessionGoal).toBe(3);
    expect(s.pinHash).toBeNull();
    expect(activeReward(s)).toBeNull();
  });

  it("pin set / verify / clear roundtrip", async () => {
    await setPin(PROFILE, "1234");
    expect(await verifyPin(PROFILE, "1234")).toBe(true);
    expect(await verifyPin(PROFILE, "0000")).toBe(false);
    await clearPin(PROFILE);
    expect(await verifyPin(PROFILE, "1234")).toBe(false);
  });

  it("activeReward is the first unredeemed reward", async () => {
    const s = await getParentSettings(PROFILE);
    s.rewards = [
      { id: "a", title: "舊獎品", targetStamps: 5, createdAt: 1, redeemedAt: 99 },
      { id: "b", title: "動物園", targetStamps: 10, createdAt: 2, redeemedAt: null },
    ];
    await saveParentSettings(s);
    const loaded = await getParentSettings(PROFILE);
    expect(activeReward(loaded)?.id).toBe("b");
  });
});
