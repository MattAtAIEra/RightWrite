// src/storage/parentStore.ts
import { getDB } from "./db";
import type { ParentSettings, RewardConfig } from "../rewards/types";
import { DEFAULT_WEEKLY_GOAL } from "../rewards/types";

export async function getParentSettings(profileId: string): Promise<ParentSettings> {
  const db = await getDB();
  const existing = await db.get("parentSettings", profileId);
  if (existing) return existing;
  return {
    profileId,
    pinHash: null,
    weeklySessionGoal: DEFAULT_WEEKLY_GOAL,
    rewards: [],
    updatedAt: Date.now(),
    syncedAt: null,
  };
}

export async function saveParentSettings(settings: ParentSettings): Promise<void> {
  const db = await getDB();
  await db.put("parentSettings", { ...settings, updatedAt: Date.now() });
}

/** 進行中的獎品 = 尚未兌換的第一筆 */
export function activeReward(settings: ParentSettings): RewardConfig | null {
  return settings.rewards.find((r) => r.redeemedAt === null) ?? null;
}

// --- PIN --------------------------------------------------------------
// A local speed bump against curious kids, not a security boundary: the hash
// lives in the same IndexedDB the child's browser can open.

async function hashPin(pin: string, profileId: string): Promise<string> {
  const data = new TextEncoder().encode(`${pin}:${profileId}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function setPin(profileId: string, pin: string): Promise<void> {
  const settings = await getParentSettings(profileId);
  settings.pinHash = await hashPin(pin, profileId);
  await saveParentSettings(settings);
}

export async function verifyPin(profileId: string, pin: string): Promise<boolean> {
  const settings = await getParentSettings(profileId);
  if (!settings.pinHash) return false;
  return (await hashPin(pin, profileId)) === settings.pinHash;
}

export async function clearPin(profileId: string): Promise<void> {
  const settings = await getParentSettings(profileId);
  settings.pinHash = null;
  await saveParentSettings(settings);
}
