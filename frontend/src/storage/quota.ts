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
