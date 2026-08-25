// src/storage/stampStore.ts
import { getDB } from "./db";
import type { Stamp } from "../rewards/types";
import type { NewStamp } from "../rewards/stampEngine";

export async function listStamps(profileId: string): Promise<Stamp[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("stamps", "byProfile", profileId);
  return all.sort((a, b) => a.earnedAt - b.earnedAt);
}

export async function addStamps(fresh: NewStamp[]): Promise<Stamp[]> {
  if (fresh.length === 0) return [];
  const db = await getDB();
  const tx = db.transaction("stamps", "readwrite");
  const created: Stamp[] = fresh.map((s) => ({
    ...s,
    id: crypto.randomUUID(),
    redeemedRewardId: null,
    updatedAt: Date.now(),
    syncedAt: null,
  }));
  for (const s of created) await tx.store.put(s);
  await tx.done;
  return created;
}

export async function countUnredeemed(profileId: string): Promise<number> {
  const stamps = await listStamps(profileId);
  return stamps.filter((s) => s.redeemedRewardId === null).length;
}

/** Consume the oldest `n` unredeemed stamps for a redemption (集點卡歸零重來).
    Returns how many were actually consumed. */
export async function redeemStamps(
  profileId: string,
  rewardId: string,
  n: number,
): Promise<number> {
  const db = await getDB();
  const tx = db.transaction("stamps", "readwrite");
  const all = (await tx.store.index("byProfile").getAll(profileId))
    .filter((s) => s.redeemedRewardId === null)
    .sort((a, b) => a.earnedAt - b.earnedAt)
    .slice(0, n);
  for (const s of all) {
    s.redeemedRewardId = rewardId;
    s.updatedAt = Date.now();
    await tx.store.put(s);
  }
  await tx.done;
  return all.length;
}

export async function deleteStampsByProfile(profileId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("stamps", "readwrite");
  const all = await tx.store.index("byProfile").getAll(profileId);
  for (const s of all) await tx.store.delete(s.id);
  await tx.done;
}
