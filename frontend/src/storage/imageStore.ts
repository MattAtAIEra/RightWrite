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

export const TTL_DAYS = 120;  // 4 months
const DAY_MS = 86400_000;

export async function purgeOlderThanFourMonths(now: number = Date.now()): Promise<number> {
  const cutoff = now - TTL_DAYS * DAY_MS;
  return purgeBefore(cutoff);
}
