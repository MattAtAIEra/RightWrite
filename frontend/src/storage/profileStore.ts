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
